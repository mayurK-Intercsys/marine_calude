'use client';

import { use } from 'react';
import RequireRole from '@/components/RequireRole';
import OpenCoverDashboard from '@/components/marine/OpenCoverDashboard';

export default function OpenCoverPage({ params }) {
  const { id } = use(params);
  return <RequireRole roles={['customer', 'broker_admin', 'broker_user', 'underwriter', 'uw_manager', 'ops']}><OpenCoverDashboard id={id} /></RequireRole>;
}
