"use client"

import { useSession } from "@/features/play/session"

export type { ExpiredEvent, QuickJoinFilters } from "@/features/play/session"

/**
 * Back-compat facade over the unified {@link useSession} store. The Match Maker
 * surfaces (lobby list, Quick Match, the active-room sheet) consume this and
 * keep working against the legacy `MatchRoom` shape via projections.
 */
export function useMatchmaking() {
  const s = useSession()
  return {
    sessions: s.sessions,
    rooms: s.rooms,
    joinedIds: s.joinedIds,
    joinedRooms: s.joinedRooms,
    requestedIds: s.requestedIds,
    hostedIds: s.hostedIds,
    hostedRoomCount: s.hostedRoomCount,
    maxHostedRooms: s.maxHostedRooms,
    canHostMore: s.canHostMore,
    activeRoom: s.activeRoom,
    activeSession: s.activeSession,
    activeRoomId: s.activeRoomId,
    setActiveRoomId: s.setActiveRoomId,
    userLevel: s.userLevel,
    setUserLevel: s.setUserLevel,
    userLevels: s.userLevels,
    userLevelForSport: s.userLevelForSport,
    userName: s.userName,
    setUserName: s.setUserName,
    expiredEvents: s.expiredEvents,
    isSuitable: s.isSuitable,
    hasTimeConflict: s.hasTimeConflict,
    joinRoom: s.joinRoom,
    approveRequest: s.approveRequest,
    declineRequest: s.declineRequest,
    leaveRoom: s.leaveRoom,
    addRoom: s.addRoom,
    quickJoin: s.quickJoin,
    setRoomCapacity: s.setRoomCapacity,
    invitePlayer: s.invitePlayer,
    kickPlayer: s.kickPlayer,
    managerOpen: s.managerOpen,
    setManagerOpen: s.setManagerOpen,
    openManager: s.openManager,
    quickJoinOpen: s.quickJoinOpen,
    setQuickJoinOpen: s.setQuickJoinOpen,
    openQuickJoin: s.openQuickJoin,
    createRoomOpen: s.createRoomOpen,
    setCreateRoomOpen: s.setCreateRoomOpen,
    openCreateRoom: s.openCreateRoom,
  }
}
