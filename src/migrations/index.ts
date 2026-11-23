import * as rc1ExecutionEventsSiteDetach from './20261107_120000_rc1_execution_events_site_detach'
import * as rc2GlobalOwnerFlag from './20261116_120000_rc2_global_owner_flag'
import * as rc2ProfileSpaceMerge from './20261116_130000_rc2_profile_space_merge'
import * as rc2DiscussionPostMutationId from './20261116_150000_rc2_discussion_post_mutation_id'
import * as rc2SubscriptionThreadFk from './20261116_160000_rc2_subscription_thread_fk'
import * as rc3Seo10ScanIncompleteStatus from './20261117_120000_rc3_seo10_scan_incomplete_status'
import * as rc3Email01IntentsPauses from './20261117_130000_rc3_email01_intents_pauses'
import * as rc3Pod01FeedNamespace from './20261118_120000_rc3_pod01_feed_namespace'
import * as rc3Pod02ImportMedia from './20261118_130000_rc3_pod02_import_media'
import * as rc3Pod03MemberFeeds from './20261118_140000_rc3_pod03_member_feeds'
import * as rc3Pod04Production from './20261118_150000_rc3_pod04_production'
import * as rc3Pod05StudioSessions from './20261118_160000_rc3_pod05_studio_sessions'
import * as rc3Pod08Peaks from './20261118_170000_rc3_pod08_peaks'
import * as rc3Pod09Recordings from './20261118_180000_rc3_pod09_recordings'
import * as rc3Pod10Guests from './20261118_190000_rc3_pod10_guests'
import * as rc3Pod11Conform from './20261118_200000_rc3_pod11_conform'
import * as rc3Pod12EditProjects from './20261118_210000_rc3_pod12_edit_projects'
import * as rc3Pod13Renders from './20261118_220000_rc3_pod13_renders'
import * as rc3Pod14Assists from './20261118_230000_rc3_pod14_assists'
import * as rc3Pod16Live from './20261118_240000_rc3_pod16_live'
import * as rc3Pod17Video from './20261118_250000_rc3_pod17_video'
import * as rc3Pod18Promotion from './20261118_260000_rc3_pod18_promotion'
import * as uxi02TaskReadinessSetupDraft from './20261119_120000_uxi02_task_readiness_setup_draft'
import * as uxi06SiteVisibility from './20261119_130000_uxi06_site_visibility'
import * as podrc01DirectoryOwnerEmail from './20261120_120000_podrc01_directory_owner_email'
import * as rc1NetworkRelationshipIds from './20261101_160000_rc1_network_relationship_ids'
import * as rc1ExperimentForm from './20261101_150000_rc1_experiment_form'
import * as rc1FulfillmentBinding from './20261029_130000_rc1_fulfillment_binding'
import * as rc1ReferralLifecycle from './20261029_120000_rc1_referral_lifecycle'
import * as rc1DeliverySuppressions from './20261021_090000_rc1_delivery_suppressions'
import * as rc1DiscussionPins from './20261026_100000_rc1_discussion_pins'
import * as rc1DiscussionEventIds from './20261026_101000_rc1_discussion_event_ids'
import * as rc1SocialDispatchRecovery from './20261020_080000_rc1_social_dispatch_recovery'
import * as rc1PublicModified from './20261018_062000_rc1_public_modified'
import * as rc1ContentEntitlement from './20261018_061000_rc1_content_entitlement'
import * as rc1ReviewComments from './20261017_210000_rc1_review_comments'
import * as rc1ContentHierarchy from './20261017_230000_rc1_content_hierarchy'
import * as rc1ReviewCommentIds from './20261017_211000_rc1_review_comment_ids'
import * as rc1MachineRequestScope from './20261014_230000_rc1_machine_request_scope'
import * as rc1CartWorkerSchema from './20261014_220000_rc1_cart_and_worker_schema'
import * as migration_20261006_013000_rc08b_federation_ids from './20261006_013000_rc08b_federation_ids'
import * as rc1UuidSchemaRepair from './20261013_160000_rc1_uuid_schema_repair'
import * as rc1EditorialCalendarAudits from './20261013_180000_rc1_editorial_calendar_audits'
import * as rc08bFormIntake from './20261006_010000_rc08b_form_intake'
import * as rc03NetworkOutboxIds from './20261004_160000_rc03_network_outbox_ids'
import * as rc04CanonicalModeration from './20261004_180000_rc04_canonical_moderation'
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
import * as collectionScopeColumns from './20260924_000000_collection_scope_columns'
import * as donationCheckoutIdempotency from './20260924_010000_donation_checkout_idempotency'
import * as commerceJobEnum from './20260924_020000_commerce_job_enum'
import * as aiProposals from './20260924_030000_ai_proposals'
import * as aiLockedDocumentsRels from './20260924_040000_ai_locked_documents_rels'
import * as aiBudgetReservation from './20260924_050000_ai_budget_reservation'
import * as semanticRouteTemplates from './20260924_060000_semantic_route_templates'
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
  {
    up: collectionScopeColumns.up,
    down: collectionScopeColumns.down,
    name: '20260924_000000_collection_scope_columns',
  },
  {
    up: donationCheckoutIdempotency.up,
    down: donationCheckoutIdempotency.down,
    name: '20260924_010000_donation_checkout_idempotency',
  },
  {
    up: commerceJobEnum.up,
    down: commerceJobEnum.down,
    name: '20260924_020000_commerce_job_enum',
  },
  {
    up: aiProposals.up,
    down: aiProposals.down,
    name: '20260924_030000_ai_proposals',
  },
  {
    up: aiLockedDocumentsRels.up,
    down: aiLockedDocumentsRels.down,
    name: '20260924_040000_ai_locked_documents_rels',
  },
  {
    up: aiBudgetReservation.up,
    down: aiBudgetReservation.down,
    name: '20260924_050000_ai_budget_reservation',
  },
  {
    up: semanticRouteTemplates.up,
    down: semanticRouteTemplates.down,
    name: '20260924_060000_semantic_route_templates',
  },
  {
    up: rc03NetworkOutboxIds.up,
    down: rc03NetworkOutboxIds.down,
    name: '20261004_160000_rc03_network_outbox_ids',
  },
  {
    up: rc04CanonicalModeration.up,
    down: rc04CanonicalModeration.down,
    name: '20261004_180000_rc04_canonical_moderation',
  },
  { up: rc08bFormIntake.up, down: rc08bFormIntake.down, name: '20261006_010000_rc08b_form_intake' },
  {
    up: migration_20261006_013000_rc08b_federation_ids.up,
    down: migration_20261006_013000_rc08b_federation_ids.down,
    name: '20261006_013000_rc08b_federation_ids',
  },
  {
    up: rc1UuidSchemaRepair.up,
    down: rc1UuidSchemaRepair.down,
    name: '20261013_160000_rc1_uuid_schema_repair',
  },
  {
    up: rc1EditorialCalendarAudits.up,
    down: rc1EditorialCalendarAudits.down,
    name: '20261013_180000_rc1_editorial_calendar_audits',
  },
  {
    up: rc1CartWorkerSchema.up,
    down: rc1CartWorkerSchema.down,
    name: '20261014_220000_rc1_cart_and_worker_schema',
  },
  {
    up: rc1MachineRequestScope.up,
    down: rc1MachineRequestScope.down,
    name: '20261014_230000_rc1_machine_request_scope',
  },
  {
    up: rc1ReviewComments.up,
    down: rc1ReviewComments.down,
    name: '20261017_210000_rc1_review_comments',
  },
  {
    up: rc1ReviewCommentIds.up,
    down: rc1ReviewCommentIds.down,
    name: '20261017_211000_rc1_review_comment_ids',
  },
  {
    up: rc1ContentHierarchy.up,
    down: rc1ContentHierarchy.down,
    name: '20261017_230000_rc1_content_hierarchy',
  },
  {
    up: rc1ContentVisibility.up,
    down: rc1ContentVisibility.down,
    name: '20261018_050000_rc1_content_visibility',
  },
  {
    up: rc1TaxonomyLayoutSeoFields.up,
    down: rc1TaxonomyLayoutSeoFields.down,
    name: '20261018_060000_rc1_taxonomy_layout_seo_fields',
  },
  {
    up: rc1ContentEntitlement.up,
    down: rc1ContentEntitlement.down,
    name: '20261018_061000_rc1_content_entitlement',
  },
  {
    up: rc1PublicModified.up,
    down: rc1PublicModified.down,
    name: '20261018_062000_rc1_public_modified',
  },
  {
    up: rc1SocialDispatchRecovery.up,
    down: rc1SocialDispatchRecovery.down,
    name: '20261020_080000_rc1_social_dispatch_recovery',
  },
  {
    up: rc1DeliverySuppressions.up,
    down: rc1DeliverySuppressions.down,
    name: '20261021_090000_rc1_delivery_suppressions',
  },
  {
    up: rc1DiscussionPins.up,
    down: rc1DiscussionPins.down,
    name: '20261026_100000_rc1_discussion_pins',
  },
  {
    up: rc1DiscussionEventIds.up,
    down: rc1DiscussionEventIds.down,
    name: '20261026_101000_rc1_discussion_event_ids',
  },
  {
    up: rc1ReferralLifecycle.up,
    down: rc1ReferralLifecycle.down,
    name: '20261029_120000_rc1_referral_lifecycle',
  },
  {
    up: rc1FulfillmentBinding.up,
    down: rc1FulfillmentBinding.down,
    name: '20261029_130000_rc1_fulfillment_binding',
  },
  {
    up: rc1ExperimentForm.up,
    down: rc1ExperimentForm.down,
    name: '20261101_150000_rc1_experiment_form',
  },
  {
    up: rc1NetworkRelationshipIds.up,
    down: rc1NetworkRelationshipIds.down,
    name: '20261101_160000_rc1_network_relationship_ids',
  },
  {
    up: rc1ExecutionEventsSiteDetach.up,
    down: rc1ExecutionEventsSiteDetach.down,
    name: '20261107_120000_rc1_execution_events_site_detach',
  },
  {
    up: rc2GlobalOwnerFlag.up,
    down: rc2GlobalOwnerFlag.down,
    name: '20261116_120000_rc2_global_owner_flag',
  },
  {
    up: rc2ProfileSpaceMerge.up,
    down: rc2ProfileSpaceMerge.down,
    name: '20261116_130000_rc2_profile_space_merge',
  },
  {
    up: rc2DiscussionPostMutationId.up,
    down: rc2DiscussionPostMutationId.down,
    name: '20261116_150000_rc2_discussion_post_mutation_id',
  },
  {
    up: rc2SubscriptionThreadFk.up,
    down: rc2SubscriptionThreadFk.down,
    name: '20261116_160000_rc2_subscription_thread_fk',
  },
  {
    up: rc3Seo10ScanIncompleteStatus.up,
    down: rc3Seo10ScanIncompleteStatus.down,
    name: '20261117_120000_rc3_seo10_scan_incomplete_status',
  },
  {
    up: rc3Email01IntentsPauses.up,
    down: rc3Email01IntentsPauses.down,
    name: '20261117_130000_rc3_email01_intents_pauses',
  },
  {
    up: rc3Pod01FeedNamespace.up,
    down: rc3Pod01FeedNamespace.down,
    name: '20261118_120000_rc3_pod01_feed_namespace',
  },
  {
    up: rc3Pod02ImportMedia.up,
    down: rc3Pod02ImportMedia.down,
    name: '20261118_130000_rc3_pod02_import_media',
  },
  {
    up: rc3Pod03MemberFeeds.up,
    down: rc3Pod03MemberFeeds.down,
    name: '20261118_140000_rc3_pod03_member_feeds',
  },
  {
    up: rc3Pod04Production.up,
    down: rc3Pod04Production.down,
    name: '20261118_150000_rc3_pod04_production',
  },
  {
    up: rc3Pod05StudioSessions.up,
    down: rc3Pod05StudioSessions.down,
    name: '20261118_160000_rc3_pod05_studio_sessions',
  },
  {
    up: rc3Pod08Peaks.up,
    down: rc3Pod08Peaks.down,
    name: '20261118_170000_rc3_pod08_peaks',
  },
  {
    up: rc3Pod09Recordings.up,
    down: rc3Pod09Recordings.down,
    name: '20261118_180000_rc3_pod09_recordings',
  },
  {
    up: rc3Pod10Guests.up,
    down: rc3Pod10Guests.down,
    name: '20261118_190000_rc3_pod10_guests',
  },
  {
    up: rc3Pod11Conform.up,
    down: rc3Pod11Conform.down,
    name: '20261118_200000_rc3_pod11_conform',
  },
  {
    up: rc3Pod12EditProjects.up,
    down: rc3Pod12EditProjects.down,
    name: '20261118_210000_rc3_pod12_edit_projects',
  },
  {
    up: rc3Pod13Renders.up,
    down: rc3Pod13Renders.down,
    name: '20261118_220000_rc3_pod13_renders',
  },
  {
    up: rc3Pod14Assists.up,
    down: rc3Pod14Assists.down,
    name: '20261118_230000_rc3_pod14_assists',
  },
  {
    up: rc3Pod16Live.up,
    down: rc3Pod16Live.down,
    name: '20261118_240000_rc3_pod16_live',
  },
  {
    up: rc3Pod17Video.up,
    down: rc3Pod17Video.down,
    name: '20261118_250000_rc3_pod17_video',
  },
  {
    up: rc3Pod18Promotion.up,
    down: rc3Pod18Promotion.down,
    name: '20261118_260000_rc3_pod18_promotion',
  },
  {
    up: uxi02TaskReadinessSetupDraft.up,
    down: uxi02TaskReadinessSetupDraft.down,
    name: '20261119_120000_uxi02_task_readiness_setup_draft',
  },
  {
    up: uxi06SiteVisibility.up,
    down: uxi06SiteVisibility.down,
    name: '20261119_130000_uxi06_site_visibility',
  },
  {
    up: podrc01DirectoryOwnerEmail.up,
    down: podrc01DirectoryOwnerEmail.down,
    name: '20261120_120000_podrc01_directory_owner_email',
  },
  {
    up: rc315aThreadNotificationDispatch.up,
    down: rc315aThreadNotificationDispatch.down,
    name: '20261121_120000_rc315a_thread_notification_dispatch',
  },
  {
    up: rc316EvergreenHandoff.up,
    down: rc316EvergreenHandoff.down,
    name: '20261121_130000_rc316_evergreen_handoff',
  },
  {
    up: rc315bGroupsRooms.up,
    down: rc315bGroupsRooms.down,
    name: '20261121_170000_rc315b_groups_rooms',
  },
  {
    up: rc312CreatorCatalog.up,
    down: rc312CreatorCatalog.down,
    name: '20261121_190000_rc312_creator_catalog',
  },
  {
    up: rc314Repurpose.up,
    down: rc314Repurpose.down,
    name: '20261121_200000_rc314_repurpose',
  },
  {
    up: rc317EditorialDepth.up,
    down: rc317EditorialDepth.down,
    name: '20261122_090000_rc317_editorial_depth',
  },
  {
    up: cre01CreatorPolicy.up,
    down: cre01CreatorPolicy.down,
    name: '20261122_120000_cre01_creator_policy',
  },
  {
    up: cre01SpaceDescription.up,
    down: cre01SpaceDescription.down,
    name: '20261122_130000_cre01_space_description',
  },
  {
    up: cre02Submissions.up,
    down: cre02Submissions.down,
    name: '20261122_140000_cre02_submissions',
  },
  {
    up: cre03Portfolios.up,
    down: cre03Portfolios.down,
    name: '20261122_150000_cre03_portfolios',
  },
  {
    up: cre05MediaEdits.up,
    down: cre05MediaEdits.down,
    name: '20261122_160000_cre05_media_edits',
  },
  {
    up: cre06VideoSources.up,
    down: cre06VideoSources.down,
    name: '20261122_170000_cre06_video_sources',
  },
  {
    up: cre07TheaterRooms.up,
    down: cre07TheaterRooms.down,
    name: '20261122_180000_cre07_theater_rooms',
  },
  {
    up: cre08LiveMedia.up,
    down: cre08LiveMedia.down,
    name: '20261122_190000_cre08_live_media',
  },
  {
    up: cre10Destinations.up,
    down: cre10Destinations.down,
    name: '20261122_200000_cre10_destinations',
  },
  { up: cre11LiveEvents.up, down: cre11LiveEvents.down, name: '20261123_090000_cre11_live_events' },
  {
    up: cre12CaptionWorkers.up,
    down: cre12CaptionWorkers.down,
    name: '20261123_100000_cre12_caption_workers',
  },
  {
    up: rc319AutomationResumeTask.up,
    down: rc319AutomationResumeTask.down,
    name: '20261122_160000_rc319_automation_resume_task',
  },
]
import * as cre05MediaEdits from './20261122_160000_cre05_media_edits'
import * as cre03Portfolios from './20261122_150000_cre03_portfolios'
import * as cre01CreatorPolicy from './20261122_120000_cre01_creator_policy'
import * as cre01SpaceDescription from './20261122_130000_cre01_space_description'
import * as cre02Submissions from './20261122_140000_cre02_submissions'
import * as rc1ContentVisibility from './20261018_050000_rc1_content_visibility'
import * as rc1TaxonomyLayoutSeoFields from './20261018_060000_rc1_taxonomy_layout_seo_fields'
import * as rc315aThreadNotificationDispatch from './20261121_120000_rc315a_thread_notification_dispatch'
import * as rc316EvergreenHandoff from './20261121_130000_rc316_evergreen_handoff'
import * as rc315bGroupsRooms from './20261121_170000_rc315b_groups_rooms'
import * as rc312CreatorCatalog from './20261121_190000_rc312_creator_catalog'
import * as rc314Repurpose from './20261121_200000_rc314_repurpose'
import * as rc317EditorialDepth from './20261122_090000_rc317_editorial_depth'
import * as cre06VideoSources from './20261122_170000_cre06_video_sources'
import * as cre07TheaterRooms from './20261122_180000_cre07_theater_rooms'
import * as cre08LiveMedia from './20261122_190000_cre08_live_media'
import * as cre10Destinations from './20261122_200000_cre10_destinations'
import * as cre11LiveEvents from './20261123_090000_cre11_live_events'
import * as cre12CaptionWorkers from './20261123_100000_cre12_caption_workers'
import * as rc319AutomationResumeTask from './20261122_160000_rc319_automation_resume_task'
