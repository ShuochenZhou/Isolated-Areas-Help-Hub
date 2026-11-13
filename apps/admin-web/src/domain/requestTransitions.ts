import type { RequestStatus } from '@/api/types'

export interface RequestAction { label: string; status: RequestStatus; type?: 'primary' | 'success' | 'danger' }

export const requestTransitions: Partial<Record<RequestStatus, RequestAction[]>> = {
  // Nothing is approved automatically: staff approve or decline each request themselves.
  SUBMITTED: [
    { label: '批准', status: 'APPROVED', type: 'success' },
    { label: '拒绝', status: 'REJECTED', type: 'danger' },
  ],
  UNDER_REVIEW: [
    { label: '批准', status: 'APPROVED', type: 'success' },
    { label: '拒绝', status: 'REJECTED', type: 'danger' },
  ],
  APPROVED: [{ label: '标记已调度', status: 'SCHEDULED', type: 'primary' }],
  SCHEDULED: [{ label: '确认完成', status: 'FULFILLED', type: 'success' }],
}

export function actionsFor(status: RequestStatus): RequestAction[] {
  return requestTransitions[status] || []
}
