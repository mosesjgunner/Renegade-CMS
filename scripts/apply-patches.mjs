import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const getIsLockedPath = resolve('node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js')

if (existsSync(getIsLockedPath)) {
  const content = readFileSync(getIsLockedPath, 'utf8')
  const marker = '// RC08D-01-LOCK-OWNER-PROJECTION-PATCH'

  if (!content.includes(marker)) {
    const fullPatchedContent = `${marker}
import { sanitizeID } from '@payloadcms/ui/shared';
import { extractID } from 'payload/shared';

export const getIsLocked = async ({
  id,
  collectionConfig,
  globalConfig,
  isEditing,
  req,
}) => {
  try {
    const entityConfig = collectionConfig || globalConfig;
    const entityHasLockingEnabled =
      entityConfig?.lockDocuments !== undefined ? entityConfig?.lockDocuments : true;

    // Check if the locked-documents collection exists
    if (!req?.payload?.collections?.['payload-locked-documents']) {
      return {
        isLocked: false,
      };
    }

    if (!entityHasLockingEnabled || !isEditing) {
      return {
        isLocked: false,
      };
    }

    const where = {};
    const lockDurationDefault = 300; // Default 5 minutes in seconds
    const lockDuration =
      typeof entityConfig.lockDocuments === 'object'
        ? entityConfig.lockDocuments.duration
        : lockDurationDefault;
    const lockDurationInMilliseconds = lockDuration * 1000;
    const now = new Date().getTime();

    if (globalConfig) {
      where.and = [
        {
          globalSlug: {
            equals: globalConfig.slug,
          },
        },
        {
          updatedAt: {
            greater_than: new Date(now - lockDurationInMilliseconds),
          },
        },
      ];
    } else {
      where.and = [
        {
          'document.value': {
            equals: sanitizeID(id),
          },
        },
        {
          'document.relationTo': {
            equals: collectionConfig.slug,
          },
        },
        {
          updatedAt: {
            greater_than: new Date(now - lockDurationInMilliseconds),
          },
        },
      ];
    }

    const { docs } = await req.payload.find({
      collection: 'payload-locked-documents',
      depth: 1,
      overrideAccess: false,
      req,
      where,
    });

    if (docs && docs.length > 0) {
      const lockDoc = docs[0];
      const parsedTime = new Date(lockDoc.updatedAt).getTime();
      const lastUpdateTime = Number.isNaN(parsedTime) ? now : parsedTime;

      // Extract user object and ID across polymorphic, monomorphic, populated, and unpopulated shapes
      const extractOwnerInfo = (rawUser) => {
        let userObj = undefined;
        let ownerId = undefined;

        if (rawUser && typeof rawUser === 'object') {
          if ('value' in rawUser) {
            if (rawUser.value && typeof rawUser.value === 'object') {
              userObj = rawUser.value;
              ownerId = rawUser.value.id;
            } else if (rawUser.value !== null && rawUser.value !== undefined) {
              ownerId = rawUser.value;
            }
          } else if ('id' in rawUser && rawUser.id) {
            userObj = rawUser;
            ownerId = rawUser.id;
          }
        } else if (typeof rawUser === 'string' || typeof rawUser === 'number') {
          ownerId = rawUser;
        }

        return { userObj, ownerId };
      };

      let { userObj, ownerId } = extractOwnerInfo(lockDoc.user);

      // If ownerId is missing or userObj is not populated, attempt fallback lookup with overrideAccess: true
      if (!ownerId || !userObj || !userObj.email) {
        try {
          const fullLock = await req.payload.findByID({
            collection: 'payload-locked-documents',
            id: lockDoc.id,
            depth: 1,
            overrideAccess: true,
            req,
          });
          const fallback = extractOwnerInfo(fullLock?.user);
          userObj = userObj ?? fallback.userObj;
          ownerId = ownerId ?? fallback.ownerId;
        } catch {
          // Non-fatal
        }
      }

      // If ownerId is resolved but userObj is still not populated, hydrate user object from 'users'
      if (ownerId && (!userObj || typeof userObj !== 'object')) {
        try {
          const hydratedUser = await req.payload.findByID({
            collection: 'users',
            id: ownerId,
            depth: 0,
            overrideAccess: true,
            req,
          });
          if (hydratedUser) {
            userObj = hydratedUser;
          }
        } catch {
          // Non-fatal
        }
      }

      // Malformed or missing lock owner fails safely without blanking the editor
      if (!ownerId) {
        return {
          currentEditor: null,
          isLocked: false,
          lastUpdateTime,
        };
      }

      const currentUserId = req?.user?.id;
      const isCurrentEditor = currentUserId && String(ownerId) === String(currentUserId);

      if (!isCurrentEditor) {
        return {
          currentEditor: userObj ?? { id: ownerId },
          isLocked: true,
          lastUpdateTime,
        };
      }

      return {
        currentEditor: userObj ?? req?.user,
        isLocked: false,
        lastUpdateTime,
      };
    }

    return {
      isLocked: false,
    };
  } catch (err) {
    req?.payload?.logger?.error?.({
      err,
      msg: 'Document locking inspection encountered a non-fatal error; defaulting to unlocked state',
    });
    return {
      isLocked: false,
    };
  }
};
`
    writeFileSync(getIsLockedPath, fullPatchedContent, 'utf8')
    console.log('Applied RC08D-01 patch to getIsLocked.js')
  }
}
