import { describe, expect, it } from 'vitest'
import { actionsFor } from './requestTransitions'

describe('request workflow', () => {
  it('does not allow operators to change terminal requests', () => {
    expect(actionsFor('FULFILLED')).toEqual([])
    expect(actionsFor('REJECTED')).toEqual([])
    expect(actionsFor('CANCELLED')).toEqual([])
  })

  it('lets staff approve or decline every new request themselves', () => {
    expect(actionsFor('SUBMITTED').map(action => action.status)).toEqual(['APPROVED', 'REJECTED'])
    expect(actionsFor('UNDER_REVIEW').map(action => action.status)).toEqual(['APPROVED', 'REJECTED'])
    expect(actionsFor('APPROVED').map(action => action.status)).toEqual(['SCHEDULED'])
  })
})
