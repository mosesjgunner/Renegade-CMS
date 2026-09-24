import * as pre05LegacySiteMigration from './20260912_050000_pre_05_legacy_site_migration'
import * as med00 from './20260912_060000_med_00_media_contract'
import * as med01UploadSessions from './20260912_070000_med_01_upload_sessions'
import * as med02DamGovernance from './20260913_080000_med_02_dam_governance'
import * as med03ImageVariants from './20260913_090000_med_03_image_variants'
import * as med04PodcastWorkflow from './20260913_100000_med_04_podcast_workflow'
import * as med05VideoWorkflow from './20260914_110000_med_05_video_workflow'
import * as disc01DiscoveryWorkflow from './20260914_120000_disc_01_discovery_workflow'
import * as disc01SharedSeoFields from './20260914_121000_disc_01_shared_seo_fields'
import * as disc04SearchProjection from './20260915_130000_disc_04_search_projection'
import * as editorialQualityGateSnapshot from './20260916_070000_editorial_quality_gate_snapshot'
import * as aud00DeliverySnapshots from './20260920_000000_aud_00_delivery_snapshots'
import * as shop05Subscriptions from './20260923_040000_shop_05_subscriptions'
import * as shop06AffiliateAndReferrals from './20260923_050000_shop_06_affiliate_and_referrals'
import * as shop07Donations from './20260923_060000_shop_07_donations'
import * as shop07DonationLifecycle from './20260923_070000_shop_07_donation_lifecycle'
import * as shop03PodAndFulfillment from './20260923_080000_shop_03_pod_and_fulfillment'
import * as eventsRequiredEntitlement from './20260923_090000_events_required_entitlement'
import * as flow03SchedulerRuntime from './20260923_100000_flow_03_scheduler_runtime'
import * as contentReleaseRuntime from './20260923_110000_content_release_runtime'
import * as aud01AudienceEvidence from './20260920_010000_aud_01_audience_evidence'
import * as aud02Forms from './20260920_020000_aud_02_forms'
import * as aud03EmailComposer from './20260920_030000_aud_03_email_composer'
import * as aud05EmailDelivery from './20260920_050000_aud_05_email_delivery'
import * as aud06Telecom from './20260920_060000_aud_06_telecom'
import * as aud07AudienceCommand from './20260920_070000_aud_07_audience_command'
import * as aud08AudiencePassGate from './20260920_080000_aud_08_audience_pass_gate'
import * as comm00CommunityDomain from './20260920_090000_comm_00_community_domain'
import * as comm01MemberAuthLifecycle from './20260920_100000_comm_01_member_auth_lifecycle'
import * as comm02ProfileProjection from './20260921_000000_comm_02_profile_projection'
import * as comm02ProfileMediaUsageRelation from './20260921_010000_comm_02_profile_media_usage_relation'
import * as comm03aCommentIdentity from './20260921_020000_comm_03a_comment_identity'
import * as comm03cCommentReactions from './20260921_030000_comm_03c_comment_reactions'
import * as comm03dThreadLifecycleAndOutbox from './20260921_040000_comm_03d_thread_lifecycle_and_outbox'
import * as comm04aForumSpaces from './20260921_050000_comm_04a_forum_spaces'
import * as comm04bForumTopicsPosts from './20260922_000000_comm_04b_forum_topics_posts'
import * as comm04cForumBrowsingReadState from './20260922_010000_comm_04c_forum_browsing_read_state'
import * as comm04dForumTopicOperations from './20260922_020000_comm_04d_forum_topic_operations'
import * as comm05aModerationRegistryReports from './20260922_030000_comm_05a_moderation_registry_reports'
import * as comm05bModerationActionsSanctions from './20260922_040000_comm_05b_moderation_actions_sanctions'
import * as comm05cModerationAppealsAudit from './20260922_050000_comm_05c_moderation_appeals_audit'
import * as comm05dAbuseTriageConsole from './20260922_060000_comm_05d_abuse_triage_console'
import * as comm07aConversations from './20260922_070000_comm_07a_conversations'
import * as comm07bMessageRequests from './20260922_080000_comm_07b_message_requests'
import * as comm07cMessageAttachments from './20260922_090000_comm_07c_message_attachments'
import * as comm07dGroupAdministration from './20260922_100000_comm_07d_group_administration'
import * as comm06bInboxProjections from './20260922_110000_comm_06b_inbox_projections'
import * as comm06cNotificationPreferencesAndOutbox from './20260922_120000_comm_06c_notification_preferences_and_outbox'
import * as commerceCanonicalContract from './20260922_130000_commerce_canonical_contract'
import * as shop01CatalogWorkflows from './20260923_010000_shop_01_catalog_workflows'
import * as shop02CartsAndProposals from './20260923_020000_shop_02_carts_and_checkout_proposals'
import * as shop04PaymentOperations from './20260923_030000_shop_04_payment_operations'
import * as pre04ReusableComposition from './20260912_040000_pre_04_reusable_composition'
import * as pre01Snapshots from './20260912_020000_pre_01_presentation_snapshots'
import * as pre03VisualEditor from './20260912_030000_pre_03_visual_editor'
import * as pre01 from './20260912_010000_pre_01_theme_lifecycle'
import * as pre00 from './20260912_000000_pre_00_theme_selection'
import * as migration_20260812_010209_initial_foundation from './20260812_010209_initial_foundation'
import * as migration_20260812_034055_m02_operations_jobs from './20260812_034055_m02_operations_jobs'
import * as migration_20260812_080000_m02_first_run_installation from './20260812_080000_m02_first_run_installation'
import * as migration_20260812_081000_m02_single_use_setup_token from './20260812_081000_m02_single_use_setup_token'
import * as migration_20260813_054441_canonical_information_architecture from './20260813_054441_canonical_information_architecture'
import * as migration_20260814_120000_m03_5_event_timeline_reconciliation from './20260814_120000_m03_5_event_timeline_reconciliation'
import * as migration_20260818_000000_site_settings from './20260818_000000_site_settings'
import * as migration_20260818_010000_reconcile_seo_canonical_columns from './20260818_010000_reconcile_seo_canonical_columns'
import * as migration_20260818_062327_m04_c_editorial_workflow from './20260818_062327_m04_c_editorial_workflow'
import * as migration_20260822_010232_page_layouts from './20260822_010232_page_layouts'
import * as migration_20260822_012313_m07_a_passwordless_identity from './20260822_012313_m07_a_passwordless_identity'
import * as migration_20260825_171336 from './20260825_171336'
import * as migration_20260825_171738 from './20260825_171738'
import * as migration_20260825_173116_social_distribution from './20260825_173116_social_distribution'
import * as migration_20260825_180000_calendar_graphics from './20260825_180000_calendar_graphics'
import * as migration_20260826_053416_second_pass_schema from './20260826_053416_second_pass_schema'
import * as migration_20260829_110000_content_release_execution from './20260829_110000_content_release_execution'
import * as migration_20260829_120000_quality_runtime from './20260829_120000_quality_runtime'
import * as migration_20260829_130000_progressive_disclosure_admin from './20260829_130000_progressive_disclosure_admin'
import * as migration_20260829_140000_onboarding_settings from './20260829_140000_onboarding_settings'
import * as migration_20260829_150000_integrations from './20260829_150000_integrations'
import * as migration_20260829_160000_activitypub_delivery from './20260829_160000_activitypub_delivery'
import * as migration_20260829_170000_network_experience from './20260829_170000_network_experience'
import * as migration_20260829_180000_collaboration from './20260829_180000_collaboration'
import * as migration_20260830_090000_realtime_collaboration from './20260830_090000_realtime_collaboration'
import * as migration_20260830_100000_media_storage_workflow from './20260830_100000_media_storage_workflow'
import * as migration_20260830_110000_discoverability from './20260830_110000_discoverability'
import * as migration_20260830_120000_discoverability_lock_relation from './20260830_120000_discoverability_lock_relation'
import * as migration_20260830_130000_admin_auth_hardening from './20260830_130000_admin_auth_hardening'
import * as migration_20260831_200000_member_identity_foundation from './20260831_200000_member_identity_foundation'
import * as migration_20260831_090000_phase_b_execution_foundation from './20260831_090000_phase_b_execution_foundation'
import * as migration_20260831_100000_analytics_privacy_runtime from './20260831_100000_analytics_privacy_runtime'
import * as migration_20260831_110000_events_workflow from './20260831_110000_events_workflow'
import * as migration_20260831_120000_media_publishing_workflows from './20260831_120000_media_publishing_workflows'
import * as migration_20260831_130000_books_quality_center from './20260831_130000_books_quality_center'
import * as migration_20260831_140000_public_api_webhooks from './20260831_140000_public_api_webhooks'
import * as migration_20260831_150000_phase_b_locked_document_relations from './20260831_150000_phase_b_locked_document_relations'
import * as migration_20260831_160000_phase_b_book_lifecycle_reconciliation from './20260831_160000_phase_b_book_lifecycle_reconciliation'
import * as migration_20260831_170000_phase_b_scoped_media_reconciliation from './20260831_170000_phase_b_scoped_media_reconciliation'
import * as migration_20260831_180000_phase_b_video_captions_relation from './20260831_180000_phase_b_video_captions_relation'
import * as migration_20260831_190000_phase_b_integrations_id_defaults from './20260831_190000_phase_b_integrations_id_defaults'
import * as migration_20260902_000000_pub_02_content_publishing_pass from './20260902_000000_pub_02_content_publishing_pass'
import * as migration_20260902_010000_pub_01_canonical_tenant_isolation from './20260902_010000_pub_01_canonical_tenant_isolation'
import * as migration_20260902_020000_pub_04_publishing_floor from './20260902_020000_pub_04_publishing_floor'

export const migrations = [
  {
    up: migration_20260812_010209_initial_foundation.up,
    down: migration_20260812_010209_initial_foundation.down,
    name: '20260812_010209_initial_foundation',
  },
  {
    up: migration_20260812_034055_m02_operations_jobs.up,
    down: migration_20260812_034055_m02_operations_jobs.down,
    name: '20260812_034055_m02_operations_jobs',
  },
  {
    up: migration_20260812_080000_m02_first_run_installation.up,
    down: migration_20260812_080000_m02_first_run_installation.down,
    name: '20260812_080000_m02_first_run_installation',
  },
  {
    up: migration_20260812_081000_m02_single_use_setup_token.up,
    down: migration_20260812_081000_m02_single_use_setup_token.down,
    name: '20260812_081000_m02_single_use_setup_token',
  },
  {
    up: migration_20260813_054441_canonical_information_architecture.up,
    down: migration_20260813_054441_canonical_information_architecture.down,
    name: '20260813_054441_canonical_information_architecture',
  },
  {
    up: migration_20260814_120000_m03_5_event_timeline_reconciliation.up,
    down: migration_20260814_120000_m03_5_event_timeline_reconciliation.down,
    name: '20260814_120000_m03_5_event_timeline_reconciliation',
  },
  {
    up: migration_20260818_000000_site_settings.up,
    down: migration_20260818_000000_site_settings.down,
    name: '20260818_000000_site_settings',
  },
  {
    up: migration_20260818_010000_reconcile_seo_canonical_columns.up,
    down: migration_20260818_010000_reconcile_seo_canonical_columns.down,
    name: '20260818_010000_reconcile_seo_canonical_columns',
  },
  {
    up: migration_20260818_062327_m04_c_editorial_workflow.up,
    down: migration_20260818_062327_m04_c_editorial_workflow.down,
    name: '20260818_062327_m04_c_editorial_workflow',
  },
  {
    up: migration_20260822_010232_page_layouts.up,
    down: migration_20260822_010232_page_layouts.down,
    name: '20260822_010232_page_layouts',
  },
  {
    up: migration_20260822_012313_m07_a_passwordless_identity.up,
    down: migration_20260822_012313_m07_a_passwordless_identity.down,
    name: '20260822_012313_m07_a_passwordless_identity',
  },
  {
    up: migration_20260825_171336.up,
    down: migration_20260825_171336.down,
    name: '20260825_171336',
  },
  {
    up: migration_20260825_171738.up,
    down: migration_20260825_171738.down,
    name: '20260825_171738',
  },
  {
    up: migration_20260825_173116_social_distribution.up,
    down: migration_20260825_173116_social_distribution.down,
    name: '20260825_173116_social_distribution',
  },
  {
    up: migration_20260825_180000_calendar_graphics.up,
    down: migration_20260825_180000_calendar_graphics.down,
    name: '20260825_180000_calendar_graphics',
  },
  {
    up: migration_20260826_053416_second_pass_schema.up,
    down: migration_20260826_053416_second_pass_schema.down,
    name: '20260826_053416_second_pass_schema',
  },
  {
    up: migration_20260829_110000_content_release_execution.up,
    down: migration_20260829_110000_content_release_execution.down,
    name: '20260829_110000_content_release_execution',
  },
  {
    up: migration_20260829_120000_quality_runtime.up,
    down: migration_20260829_120000_quality_runtime.down,
    name: '20260829_120000_quality_runtime',
  },
  {
    up: migration_20260829_130000_progressive_disclosure_admin.up,
    down: migration_20260829_130000_progressive_disclosure_admin.down,
    name: '20260829_130000_progressive_disclosure_admin',
  },
  {
    up: migration_20260829_140000_onboarding_settings.up,
    down: migration_20260829_140000_onboarding_settings.down,
    name: '20260829_140000_onboarding_settings',
  },
  {
    up: migration_20260829_150000_integrations.up,
    down: migration_20260829_150000_integrations.down,
    name: '20260829_150000_integrations',
  },
  {
    up: migration_20260829_160000_activitypub_delivery.up,
    down: migration_20260829_160000_activitypub_delivery.down,
    name: '20260829_160000_activitypub_delivery',
  },
  {
    up: migration_20260829_170000_network_experience.up,
    down: migration_20260829_170000_network_experience.down,
    name: '20260829_170000_network_experience',
  },
  {
    up: migration_20260829_180000_collaboration.up,
    down: migration_20260829_180000_collaboration.down,
    name: '20260829_180000_collaboration',
  },
  {
    up: migration_20260830_090000_realtime_collaboration.up,
    down: migration_20260830_090000_realtime_collaboration.down,
    name: '20260830_090000_realtime_collaboration',
  },
  {
    up: migration_20260830_100000_media_storage_workflow.up,
    down: migration_20260830_100000_media_storage_workflow.down,
    name: '20260830_100000_media_storage_workflow',
  },
  {
    up: migration_20260830_110000_discoverability.up,
    down: migration_20260830_110000_discoverability.down,
    name: '20260830_110000_discoverability',
  },
  {
    up: migration_20260830_120000_discoverability_lock_relation.up,
    down: migration_20260830_120000_discoverability_lock_relation.down,
    name: '20260830_120000_discoverability_lock_relation',
  },
  {
    up: migration_20260830_130000_admin_auth_hardening.up,
    down: migration_20260830_130000_admin_auth_hardening.down,
    name: '20260830_130000_admin_auth_hardening',
  },
  {
    up: migration_20260831_090000_phase_b_execution_foundation.up,
    down: migration_20260831_090000_phase_b_execution_foundation.down,
    name: '20260831_090000_phase_b_execution_foundation',
  },
  {
    up: migration_20260831_100000_analytics_privacy_runtime.up,
    down: migration_20260831_100000_analytics_privacy_runtime.down,
    name: '20260831_100000_analytics_privacy_runtime',
  },
  {
    up: migration_20260831_110000_events_workflow.up,
    down: migration_20260831_110000_events_workflow.down,
    name: '20260831_110000_events_workflow',
  },
  {
    up: migration_20260831_120000_media_publishing_workflows.up,
    down: migration_20260831_120000_media_publishing_workflows.down,
    name: '20260831_120000_media_publishing_workflows',
  },
  {
    up: migration_20260831_130000_books_quality_center.up,
    down: migration_20260831_130000_books_quality_center.down,
    name: '20260831_130000_books_quality_center',
  },
  {
    up: migration_20260831_140000_public_api_webhooks.up,
    down: migration_20260831_140000_public_api_webhooks.down,
    name: '20260831_140000_public_api_webhooks',
  },
  {
    up: migration_20260831_150000_phase_b_locked_document_relations.up,
    down: migration_20260831_150000_phase_b_locked_document_relations.down,
    name: '20260831_150000_phase_b_locked_document_relations',
  },
  {
    up: migration_20260831_160000_phase_b_book_lifecycle_reconciliation.up,
    down: migration_20260831_160000_phase_b_book_lifecycle_reconciliation.down,
    name: '20260831_160000_phase_b_book_lifecycle_reconciliation',
  },
  {
    up: migration_20260831_170000_phase_b_scoped_media_reconciliation.up,
    down: migration_20260831_170000_phase_b_scoped_media_reconciliation.down,
    name: '20260831_170000_phase_b_scoped_media_reconciliation',
  },
  {
    up: migration_20260831_180000_phase_b_video_captions_relation.up,
    down: migration_20260831_180000_phase_b_video_captions_relation.down,
    name: '20260831_180000_phase_b_video_captions_relation',
  },
  {
    up: migration_20260831_190000_phase_b_integrations_id_defaults.up,
    down: migration_20260831_190000_phase_b_integrations_id_defaults.down,
    name: '20260831_190000_phase_b_integrations_id_defaults',
  },
  {
    up: migration_20260831_200000_member_identity_foundation.up,
    down: migration_20260831_200000_member_identity_foundation.down,
    name: '20260831_200000_member_identity_foundation',
  },
  {
    up: migration_20260902_000000_pub_02_content_publishing_pass.up,
    down: migration_20260902_000000_pub_02_content_publishing_pass.down,
    name: '20260902_000000_pub_02_content_publishing_pass',
  },
  {
    up: migration_20260902_010000_pub_01_canonical_tenant_isolation.up,
    down: migration_20260902_010000_pub_01_canonical_tenant_isolation.down,
    name: '20260902_010000_pub_01_canonical_tenant_isolation',
  },
  {
    up: migration_20260902_020000_pub_04_publishing_floor.up,
    down: migration_20260902_020000_pub_04_publishing_floor.down,
    name: '20260902_020000_pub_04_publishing_floor',
  },
  { up: pre00.up, down: pre00.down, name: '20260912_000000_pre_00_theme_selection' },
  { up: pre01.up, down: pre01.down, name: '20260912_010000_pre_01_theme_lifecycle' },
  {
    up: pre01Snapshots.up,
    down: pre01Snapshots.down,
    name: '20260912_020000_pre_01_presentation_snapshots',
  },
  {
    up: pre03VisualEditor.up,
    down: pre03VisualEditor.down,
    name: '20260912_030000_pre_03_visual_editor',
  },
  {
    up: pre04ReusableComposition.up,
    down: pre04ReusableComposition.down,
    name: '20260912_040000_pre_04_reusable_composition',
  },
  {
    up: pre05LegacySiteMigration.up,
    down: pre05LegacySiteMigration.down,
    name: '20260912_050000_pre_05_legacy_site_migration',
  },
  { up: med00.up, down: med00.down, name: '20260912_060000_med_00_media_contract' },
  {
    up: med01UploadSessions.up,
    down: med01UploadSessions.down,
    name: '20260912_070000_med_01_upload_sessions',
  },
  {
    up: med02DamGovernance.up,
    down: med02DamGovernance.down,
    name: '20260913_080000_med_02_dam_governance',
  },
  {
    up: med03ImageVariants.up,
    down: med03ImageVariants.down,
    name: '20260913_090000_med_03_image_variants',
  },
  {
    up: med04PodcastWorkflow.up,
    down: med04PodcastWorkflow.down,
    name: '20260913_100000_med_04_podcast_workflow',
  },
  {
    up: med05VideoWorkflow.up,
    down: med05VideoWorkflow.down,
    name: '20260914_110000_med_05_video_workflow',
  },
  {
    up: disc01DiscoveryWorkflow.up,
    down: disc01DiscoveryWorkflow.down,
    name: '20260914_120000_disc_01_discovery_workflow',
  },
  {
    up: disc01SharedSeoFields.up,
    down: disc01SharedSeoFields.down,
    name: '20260914_121000_disc_01_shared_seo_fields',
  },
  {
    up: disc04SearchProjection.up,
    down: disc04SearchProjection.down,
    name: '20260915_130000_disc_04_search_projection',
  },
  {
    up: editorialQualityGateSnapshot.up,
    down: editorialQualityGateSnapshot.down,
    name: '20260916_070000_editorial_quality_gate_snapshot',
  },
  {
    up: aud00DeliverySnapshots.up,
    down: aud00DeliverySnapshots.down,
    name: '20260920_000000_aud_00_delivery_snapshots',
  },
  {
    up: aud01AudienceEvidence.up,
    down: aud01AudienceEvidence.down,
    name: '20260920_010000_aud_01_audience_evidence',
  },
  {
    up: aud02Forms.up,
    down: aud02Forms.down,
    name: '20260920_020000_aud_02_forms',
  },
  {
    up: aud03EmailComposer.up,
    down: aud03EmailComposer.down,
    name: '20260920_030000_aud_03_email_composer',
  },
  {
    up: aud05EmailDelivery.up,
    down: aud05EmailDelivery.down,
    name: '20260920_050000_aud_05_email_delivery',
  },
  {
    up: aud06Telecom.up,
    down: aud06Telecom.down,
    name: '20260920_060000_aud_06_telecom',
  },
  {
    up: aud07AudienceCommand.up,
    down: aud07AudienceCommand.down,
    name: '20260920_070000_aud_07_audience_command',
  },
  {
    up: aud08AudiencePassGate.up,
    down: aud08AudiencePassGate.down,
    name: '20260920_080000_aud_08_audience_pass_gate',
  },
  {
    up: comm00CommunityDomain.up,
    down: comm00CommunityDomain.down,
    name: '20260920_090000_comm_00_community_domain',
  },
  {
    up: comm01MemberAuthLifecycle.up,
    down: comm01MemberAuthLifecycle.down,
    name: '20260920_100000_comm_01_member_auth_lifecycle',
  },
  {
    up: comm02ProfileProjection.up,
    down: comm02ProfileProjection.down,
    name: '20260921_000000_comm_02_profile_projection',
  },
  {
    up: comm02ProfileMediaUsageRelation.up,
    down: comm02ProfileMediaUsageRelation.down,
    name: '20260921_010000_comm_02_profile_media_usage_relation',
  },
  {
    up: comm03aCommentIdentity.up,
    down: comm03aCommentIdentity.down,
    name: '20260921_020000_comm_03a_comment_identity',
  },
  {
    up: comm03cCommentReactions.up,
    down: comm03cCommentReactions.down,
    name: '20260921_030000_comm_03c_comment_reactions',
  },
  {
    up: comm03dThreadLifecycleAndOutbox.up,
    down: comm03dThreadLifecycleAndOutbox.down,
    name: '20260921_040000_comm_03d_thread_lifecycle_and_outbox',
  },
  {
    up: comm04aForumSpaces.up,
    down: comm04aForumSpaces.down,
    name: '20260921_050000_comm_04a_forum_spaces',
  },
  {
    up: comm04bForumTopicsPosts.up,
    down: comm04bForumTopicsPosts.down,
    name: '20260922_000000_comm_04b_forum_topics_posts',
  },
  {
    up: comm04cForumBrowsingReadState.up,
    down: comm04cForumBrowsingReadState.down,
    name: '20260922_010000_comm_04c_forum_browsing_read_state',
  },
  {
    up: comm04dForumTopicOperations.up,
    down: comm04dForumTopicOperations.down,
    name: '20260922_020000_comm_04d_forum_topic_operations',
  },
  {
    up: comm05aModerationRegistryReports.up,
    down: comm05aModerationRegistryReports.down,
    name: '20260922_030000_comm_05a_moderation_registry_reports',
  },
  {
    up: comm05bModerationActionsSanctions.up,
    down: comm05bModerationActionsSanctions.down,
    name: '20260922_040000_comm_05b_moderation_actions_sanctions',
  },
  {
    up: comm05cModerationAppealsAudit.up,
    down: comm05cModerationAppealsAudit.down,
    name: '20260922_050000_comm_05c_moderation_appeals_audit',
  },
  {
    up: comm05dAbuseTriageConsole.up,
    down: comm05dAbuseTriageConsole.down,
    name: '20260922_060000_comm_05d_abuse_triage_console',
  },
  {
    up: comm07aConversations.up,
    down: comm07aConversations.down,
    name: '20260922_070000_comm_07a_conversations',
  },
  {
    up: comm07bMessageRequests.up,
    down: comm07bMessageRequests.down,
    name: '20260922_080000_comm_07b_message_requests',
  },
  {
    up: comm07cMessageAttachments.up,
    down: comm07cMessageAttachments.down,
    name: '20260922_090000_comm_07c_message_attachments',
  },
  {
    up: comm07dGroupAdministration.up,
    down: comm07dGroupAdministration.down,
    name: '20260922_100000_comm_07d_group_administration',
  },
  {
    up: comm06bInboxProjections.up,
    down: comm06bInboxProjections.down,
    name: '20260922_110000_comm_06b_inbox_projections',
  },
  {
    up: comm06cNotificationPreferencesAndOutbox.up,
    down: comm06cNotificationPreferencesAndOutbox.down,
    name: '20260922_120000_comm_06c_notification_preferences_and_outbox',
  },
  {
    up: commerceCanonicalContract.up,
    down: commerceCanonicalContract.down,
    name: '20260922_130000_commerce_canonical_contract',
  },
  {
    up: shop01CatalogWorkflows.up,
    down: shop01CatalogWorkflows.down,
    name: '20260923_010000_shop_01_catalog_workflows',
  },
  {
    up: shop02CartsAndProposals.up,
    down: shop02CartsAndProposals.down,
    name: '20260923_020000_shop_02_carts_and_checkout_proposals',
  },
  {
    up: shop04PaymentOperations.up,
    down: shop04PaymentOperations.down,
    name: '20260923_030000_shop_04_payment_operations',
  },
  {
    up: shop05Subscriptions.up,
    down: shop05Subscriptions.down,
    name: '20260923_040000_shop_05_subscriptions',
  },
  {
    up: shop06AffiliateAndReferrals.up,
    down: shop06AffiliateAndReferrals.down,
    name: '20260923_050000_shop_06_affiliate_and_referrals',
  },
  {
    up: shop07Donations.up,
    down: shop07Donations.down,
    name: '20260923_060000_shop_07_donations',
  },
  {
    up: shop07DonationLifecycle.up,
    down: shop07DonationLifecycle.down,
    name: '20260923_070000_shop_07_donation_lifecycle',
  },
  {
    up: shop03PodAndFulfillment.up,
    down: shop03PodAndFulfillment.down,
    name: '20260923_080000_shop_03_pod_and_fulfillment',
  },
  {
    up: eventsRequiredEntitlement.up,
    down: eventsRequiredEntitlement.down,
    name: '20260923_090000_events_required_entitlement',
  },
  {
    up: flow03SchedulerRuntime.up,
    down: flow03SchedulerRuntime.down,
    name: '20260923_100000_flow_03_scheduler_runtime',
  },
  {
    up: contentReleaseRuntime.up,
    down: contentReleaseRuntime.down,
    name: '20260923_110000_content_release_runtime',
  },
]
