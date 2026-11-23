# Creator Studio navigation and portability

**Create** opens the recording, private upload, live room, link import, and project flows. The photographer, filmmaker, podcast host, educator, musician, and general creator templates start private drafts. Saving a new portfolio or importing a link creates a personal space when the site has enabled self-service and granted that capability. The creator still needs the site's ordinary member grants for the tools they use.

**My Studio** shows recent media, writing drafts, upload progress and allowance, owned live rooms and events, provider connection and source status, submission decisions, and available publishing destinations. Statuses come from current records. A live room can be prepared before a provider is configured.

**My Portfolio** manages projects and collections. Add accessible descriptions to images and add captions in the media editor. Recording controls work with keyboard focus and reduced-motion preferences. Permission failures identify the blocked device step and move focus to the error.

## Export and restore

1. In the media editor, open **Export project and files** for a saved project and select **Check files for export**. The versioned JSON contains the edit recipe, caption cues and WebVTT/SRT text, file IDs, and SHA-256 checksums. Download the listed source files and cleared rendered files separately.
2. In **Create → Upload**, open **Restore a file from a project export** and enter its checksum. Confirm permission to restore the file. Studio verifies the checksum, runs the same file checks as an ordinary private upload, and retains the matching bytes.
3. Select **Import project** in the media editor. The importer resolves each file by ID and checksum or by a unique checksum in the destination creator's library. It refuses missing, ambiguous, or restricted files and saves the valid recipe as a new private project.
4. For a portfolio or creator project, use the existing portfolio JSON export and import. Restore the referenced files first. Re-link any presentation links or catalog entries that have different IDs on the destination.

**Export my Studio data** in My Studio downloads a reference index for projects, portfolios, membership, catalog relationships and linked providers. This index describes relationships. It does not grant permissions, restore purchases, reconnect providers, or replay publishing actions. It omits credentials, provider snapshots, private embed links, and third-party media bytes. Source files and derivatives require current rights and export clearance.

Private browser uploads support approved image, audio, and video formats up to the smaller of 32 MiB and the site limit. The site upload allowance also applies.
