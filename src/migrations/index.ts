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
]
