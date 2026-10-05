# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance.spec.ts >> real members, forum reply notification, preferences, moderation, private messages and session persistence
- Location: tests\rc04\acceptance.spec.ts:402:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Alice RC04"
Received: "New member"
```

# Test source

```ts
  804 |     )
  805 |     expect(
  806 |       (
  807 |         await api(
  808 |           moderator,
  809 |           'GET',
  810 |           `/api/community/messages?siteId=${site.id}&conversationId=${group.id}`,
  811 |         )
  812 |       ).messages.some((item: { body_html: string }) =>
  813 |         item.body_html.includes('Group RC04 message'),
  814 |       ),
  815 |     ).toBe(true)
  816 |     await bob.goto('/messages')
  817 |     await expect(bob.getByRole('heading', { name: 'Messages', exact: true })).toBeVisible()
  818 |     await expect(bob.getByText('RC04 group', { exact: true })).toBeVisible()
  819 |     await bob.screenshot({ path: `${evidence}/member-messages.png`, fullPage: true })
  820 |     await api(bob, 'PATCH', '/api/community/notification-preferences', {
  821 |       siteId: site.id,
  822 |       channel: 'in_app',
  823 |       frequency: 'immediate',
  824 |     })
  825 |     await api(bob, 'POST', '/api/community/relationships', {
  826 |       siteId: site.id,
  827 |       targetMemberId: a.memberId,
  828 |       kind: 'mute',
  829 |     })
  830 |     const mutedCount = (await api(bob, 'GET', `/api/community/notifications?siteId=${site.id}`))
  831 |       .notifications.length
  832 |     await api(
  833 |       alice,
  834 |       'POST',
  835 |       '/api/community/messages',
  836 |       {
  837 |         siteId: site.id,
  838 |         conversationId: conversation.id,
  839 |         body: 'Muted message retained privately',
  840 |         idempotencyKey: `mute-${Date.now()}`,
  841 |       },
  842 |       201,
  843 |     )
  844 |     expect(
  845 |       (await api(bob, 'GET', `/api/community/notifications?siteId=${site.id}`)).notifications
  846 |         .length,
  847 |     ).toBe(mutedCount)
  848 |     await api(alice, 'POST', '/api/member-auth/delete', {}, 410)
  849 |     await api(moderator, 'POST', '/api/community/moderation', {
  850 |       siteId: site.id,
  851 |       caseId: report.caseId,
  852 |       targetType: 'post',
  853 |       targetId: reply.post.id,
  854 |       action: 'suspend_posting',
  855 |       scope: 'site_global',
  856 |       reason: 'Acceptance suspended posting',
  857 |     })
  858 |     const suspended = await api(
  859 |       alice,
  860 |       'POST',
  861 |       '/api/community/threads',
  862 |       {
  863 |         siteId: site.id,
  864 |         forumId: forum.id,
  865 |         title: 'Suspension blocks new threads',
  866 |         body: 'This must not be created.',
  867 |       },
  868 |       403,
  869 |     )
  870 |     expect(suspended.code).toBe('MEMBER_POSTING_SUSPENDED')
  871 |     expect(
  872 |       (await api(moderator, 'GET', `/api/community/moderation?siteId=${site.id}`)).auditValid,
  873 |     ).toBe(true)
  874 |     const exported = await api(alice, 'GET', `/api/member-auth/export?memberId=${b.memberId}`)
  875 |     expect(JSON.stringify(exported)).not.toContain(emails[1])
  876 |     await api(bob, 'POST', '/api/community/relationships', {
  877 |       siteId: site.id,
  878 |       targetMemberId: a.memberId,
  879 |       kind: 'block',
  880 |     })
  881 |     await api(
  882 |       alice,
  883 |       'POST',
  884 |       '/api/community/messages',
  885 |       {
  886 |         siteId: site.id,
  887 |         conversationId: conversation.id,
  888 |         body: 'Blocked message',
  889 |         idempotencyKey: `block-${Date.now()}`,
  890 |       },
  891 |       403,
  892 |     )
  893 |     await api(alice, 'POST', '/api/member-auth/logout')
  894 |     await api(alice, 'GET', '/api/member-auth/me', undefined, 401)
  895 |     const fresh = await browser.newContext({
  896 |       baseURL: process.env.APP_URL,
  897 |       ignoreHTTPSErrors: true,
  898 |     })
  899 |     contexts.push(fresh)
  900 |     await fresh.tracing.start({ screenshots: true, snapshots: true, sources: true })
  901 |     const freshPage = await fresh.newPage()
  902 |     const persistent = await member(freshPage, emails[0])
  903 |     expect(persistent.memberId).toBe(a.memberId)
> 904 |     expect(persistent.profile.displayName).toBe('Alice RC04')
      |                                            ^ Error: expect(received).toBe(expected) // Object.is equality
  905 |     await freshPage.goto('/members/settings')
  906 |     await expect(freshPage.getByLabel('Visibility', { exact: true })).toHaveValue('private')
  907 |     writeFileSync(
  908 |       `${evidence}/community-privacy.json`,
  909 |       JSON.stringify(
  910 |         {
  911 |           siteId: site.id,
  912 |           memberIds: profiles.map((profile) => profile.memberId),
  913 |           threadId: thread.discussion.id,
  914 |           replyId: reply.post.id,
  915 |           reportId: report.reportId,
  916 |           conversationId: conversation.id,
  917 |           inAppOffPreventsNewNotification: true,
  918 |           externalCommunityDeliveryDeferred: true,
  919 |           noMailAfterReply: true,
  920 |           suppressedSubscriberRetainsPermittedInApp: true,
  921 |           suppressedMemberId: b.memberId,
  922 |           moderatorPrivateMessageDenial: true,
  923 |           blockDenial: true,
  924 |           mutePreventsNotification: true,
  925 |           groupMessage: true,
  926 |           notificationRead: true,
  927 |           lockedReplyDenial: true,
  928 |           closedReplyDenial: true,
  929 |           privateThreadApiAndSSRDenial: true,
  930 |           moderationThroughUI: true,
  931 |           renderedForumAndRemovedPostExclusion: true,
  932 |           suspendedPostingDenial: true,
  933 |           permanentDeletionDeferred: true,
  934 |           freshSessionPersistence: true,
  935 |           auditValid: audit.auditValid,
  936 |         },
  937 |         null,
  938 |         2,
  939 |       ),
  940 |     )
  941 |   } finally {
  942 |     for (const [index, session] of contexts.entries()) {
  943 |       await session.tracing.stop({ path: `${evidence}/member-${index}-trace.zip` })
  944 |       await session.close()
  945 |     }
  946 |     await context.tracing.stop({ path: `${evidence}/community-trace.zip` })
  947 |   }
  948 | })
  949 | 
  950 | test('public malformed input, abuse limits and deferred form boundary', async ({
  951 |   page,
  952 |   context,
  953 | }) => {
  954 |   await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  955 |   try {
  956 |     // The preceding real journey runs longer than the implemented one-minute window.
  957 |     const statuses: number[] = []
  958 |     for (const email of [
  959 |       null,
  960 |       [],
  961 |       {},
  962 |       'invalid',
  963 |       'still-invalid',
  964 |       42,
  965 |       false,
  966 |       '',
  967 |       'invalid',
  968 |       'invalid',
  969 |     ]) {
  970 |       const response = await page.request.post('/api/subscribers/subscribe', { data: { email } })
  971 |       statuses.push(response.status())
  972 |       expect([400, 429]).toContain(response.status())
  973 |     }
  974 |     expect(statuses).toContain(400)
  975 |     expect(statuses).toContain(429)
  976 |     await api(page, 'GET', '/api/forms/deferred-example', undefined, 410)
  977 |     await api(page, 'POST', '/api/forms/deferred-example', {}, 410)
  978 |     await api(page, 'POST', '/api/admin/audience/retry', { deliveryId: 'guessed' }, 403)
  979 |     writeFileSync(
  980 |       `${evidence}/public-abuse.json`,
  981 |       JSON.stringify(
  982 |         {
  983 |           statuses,
  984 |           processLocalLimit: true,
  985 |           deferredFormGET: 410,
  986 |           deferredFormPOST: 410,
  987 |           anonymousRetryDenied: 403,
  988 |         },
  989 |         null,
  990 |         2,
  991 |       ),
  992 |     )
  993 |   } finally {
  994 |     await context.tracing.stop({ path: `${evidence}/public-abuse-trace.zip` })
  995 |   }
  996 | })
  997 | 
```