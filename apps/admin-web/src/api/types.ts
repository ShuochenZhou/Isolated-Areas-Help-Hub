export type RequestStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'FULFILLED'
  | 'REJECTED'
  | 'CANCELLED'

export interface SupplyRequest {
  id: number
  residentId: number
  residentName: string
  category: string
  itemDescription: string
  quantity: number
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  fulfillmentMethod: 'PICKUP' | 'DELIVERY'
  status: RequestStatus
  latitude: number
  longitude: number
  approximateAddress?: string
  accessibilityNotes?: string
  assignedServicePointId?: number
  assignedCartId?: number
  assignedServicePointName?: string
  assignedCartName?: string
  createdAt: string
  updatedAt: string
}

export interface InventoryItem {
  id: number
  sku: string
  name: string
  category: string
  unit: string
  unitPriceFen: number
  availableQuantity: number
  reservedQuantity: number
  freeQuantity: number
  reorderThreshold: number
  version: number
  updatedAt: string
}

export interface PaymentOrder {
  paymentId: number
  outTradeNo: string
  reservationId: number
  itemName: string
  amountFen: number
  currency: string
  status: string
  transactionId?: string
  expiresAt: string
  paidAt?: string
  createdAt: string
}

export interface ImpactSummary {
  totalRequests: number
  fulfilledRequests: number
  uniqueResidentsServed: number
  fulfillmentRate: number
  medianFulfillmentMinutes: number
  completedRoutePlans: number
  routeMetersSaved: number
  feedbackResponses: number
  averageSatisfaction: number
  averageTravelMinutesSaved: number
  householdsServed: number
  peopleServed: number
  demandClustersReached: number
  stockoutIncidents: number
  stockoutRate: number
  reservationExpirationRate: number
}

export interface DemandCluster {
  clusterId: number
  centroidLatitude: number
  centroidLongitude: number
  requestCount: number
  totalUnits: number
  urgencyCounts: Record<string, number>
  requestIds: number[]
}

export interface RoutePlanSummary {
  id: number
  serviceDate: string
  status: string
  distanceMeters?: number
  baselineDistanceMeters?: number
  requestedBy: number
  createdAt: string
  completedAt?: string
  errorMessage?: string
}

export interface RouteStop {
  id: number
  cartId: number
  requestId: number
  stopOrder: number
  latitude: number
  longitude: number
  demandUnits: number
  estimatedArrival?: string
}

export interface RoutePlanDetail {
  summary: RoutePlanSummary
  stops: RouteStop[]
}
