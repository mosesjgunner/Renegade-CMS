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
]
