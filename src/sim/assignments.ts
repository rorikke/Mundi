// The photo boards (photography): the small board anyone with a camera has, and the job's full board; offering briefs
// (by reputation, contacts, skills, subjects who allow a camera, fair windows of light and weather), taking them,
// shooting (the roll and what adds to it, named), editing, delivering (stars, pay, reputation) and missing them.
// What the Lens app shows comes from the views below. Filled in by session A; until then no board has anything.
import type { Save } from '../core/store.js';
import type { WorldDef, BriefDef, PhotoClient } from '../core/world.js';
import type { Offer, Taken } from './photo.js';

/** Something a brief asks for, and whether you have it ("photography 4 ✓", "a drone ✗", "a studio ✓ rental"). */
export interface Need { text: string; have: boolean; how?: string }
/** A brief on a board as the Lens app shows it. */
export interface BriefCard { offer: Offer | Taken; brief: BriefDef; client: PhotoClient; place: string; window: string; due: number; pay50: number; pay100: number; rep: number; needs: Need[]; subject?: string; can: boolean; why?: string }
/** The board the player sees now (`small` or `full`; none without a camera, with `why`). */
export interface BoardView { kind: 'small' | 'full' | 'none'; cards: BriefCard[]; why?: string }
/** The briefs taken. */
export interface OpenView { cards: (BriefCard & { open: boolean; shot?: Taken['shot']; canShoot: boolean; canEdit: boolean; canDeliver: boolean; stars?: number })[] }
/** The You tab: reputation, contacts, deliveries, the studio, photobooks. */
export interface YouView { rep: number; words: string; cap?: number; contacts: { id: string; name: string; day: number }[]; done: number }

export function boardView(_g: Save, _w: WorldDef): BoardView { return { kind: 'none', cards: [] }; }
export function openView(_g: Save, _w: WorldDef): OpenView { return { cards: [] }; }
export function youView(_g: Save, _w: WorldDef): YouView { return { rep: 0, words: '', contacts: [], done: 0 }; }
