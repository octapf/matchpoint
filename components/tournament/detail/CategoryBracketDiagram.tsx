/**
 * CategoryBracketDiagram — single-elimination bracket rendered with React Native Views + react-native-svg.
 *
 * Design rules that prevent layout bugs:
 *  1. ONE scale factor applied uniformly to EVERY dimension (column width, gap, card height,
 *     row gap, padding, font size). No MIN_CARD_H floors, no split geometry.
 *  2. Layout uses scale=1 (natural size). The diagram is wrapped in a horizontal ScrollView when
 *     wider than the screen.
 *  3. Text has a minimum readable size (10 px) so even at aggressive scales labels are legible.
 *  4. SVG connector lines are drawn BEHIND all match cards (rendered first, low zIndex).
 *  5. Finale badge sits above the “Final” column title; all round titles sit tight to match
 *     boxes (small gap only; no medal height in non-final columns).
 *  6. Optional `userMap`: team A — avatars above the name; team B — avatars below (doubles: two photos).
 */
import React, { useId, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import type { Team, User } from '@/types';
import Colors from '@/constants/Colors';
import { fixtureBracketSectionTitleStyle, FIXTURE_BRACKET_SECTION_TITLE_FS } from '@/constants/fixtureSectionTitle';
import { Avatar } from '@/components/ui/Avatar';
import {
  bracketMatchShouldShowVsPlaceholder,
  bracketRoundTitleDisplay,
  mainBracketColumnHeadings,
} from '@/lib/knockoutRoundLabel';

// ─── Base dimensions at scale = 1 (compact match cards) ──────────────────────
const B_MATCH_H  = 54;
const B_COL_W    = 124;
const B_COL_GAP  = 16;
/** Vertical gap between stacked matches in the same column. */
const B_ROW_GAP  = 96;
const B_EDGE_PAD = 8;
/** Height reserved above each column for the round name (matches `B_BRACKET_ROUND_LABEL_FS`, up to 2 lines). */
const B_COL_LABEL_H = 36;
/** Column round labels — same base size as `fixtureBracketSectionTitleStyle` (“Cuadro”). */
const B_BRACKET_ROUND_LABEL_FS = FIXTURE_BRACKET_SECTION_TITLE_FS;
const B_BRZ_GAP  = 40;
const B_BRZ_BLW  = 72;
/** Team names in bracket cards (aligned with fixture list ~13). */
const B_FONT_TM  = 13;
/** Score line in bracket cards — slightly larger than team names for emphasis. */
const B_FONT_SC_BRACKET = 15;
const B_FONT_MIN = 12;
const B_PAD_H    = 8;
const B_PAD_V    = 6;
/** Half of vertical margin around the score line (see `styles.score`). */
const B_SCORE_MARGIN_V = 3;
const B_RADIUS   = 6;
const B_STROKE   = 1.5;
/** Legacy trophy size when category is unknown. */
const B_TROPHY = 32;
/** Large gold medal for Gold bracket (layout + render) — hero size vs Silver/Bronze. */
const B_MEDAL_GOLD = 78;
/** Silver / Bronze category medals (slightly smaller than gold). */
const B_MEDAL_CATEGORY = 42;
/** Gap between round title bottom and match card top (all columns). */
const B_TRP_AFTER_LABEL = 2;
/** Same as above — kept for readability; title→match gap is tight everywhere. */
const B_TRP_UNDER_TROPHY = 2;
/** Gap between finale medal bottom and “FINAL” text (Final column only). */
const B_GAP_MEDAL_TO_FINAL_TITLE = 4;
/** Floor for row gap when scale is tiny. */
const MIN_ROW_GAP_PX = 56;
/** `Avatar` size xs — must stay in sync with min height when `userMap` is passed. */
const B_BRACKET_AVATAR = 26;
/** Space between avatar row and team name. */
const B_BRACKET_AVATAR_NAME_GAP = 2;

const STROKE_COLOR = 'rgba(148,163,184,0.9)';

/** Gold finale badge: Matchpoint violet + amber, rays, tilted disc, bold “1”. */
const GOLD_RAY_DEG = [0, 45, 90, 135, 180, 225, 270, 315] as const;

function GoldMedalSvg({ size }: { size: number }) {
  const uid = useId().replace(/:/g, '');
  const g = `gm${uid}`;
  const cx = 50;
  const cy = 46;
  const rayLen = 36;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <RadialGradient id={`${g}Face`} cx="28%" cy="22%" r="78%" fx="22%" fy="18%">
          <Stop offset="0%" stopColor="#FFFEF5" />
          <Stop offset="28%" stopColor="#FFE047" />
          <Stop offset="52%" stopColor="#F59E0B" />
          <Stop offset="78%" stopColor="#B45309" />
          <Stop offset="100%" stopColor="#713F12" />
        </RadialGradient>
        <LinearGradient id={`${g}Rim`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FEF9C3" />
          <Stop offset="40%" stopColor="#EAB308" />
          <Stop offset="100%" stopColor="#422006" />
        </LinearGradient>
        <LinearGradient id={`${g}Ribbon`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#a78bfa" />
          <Stop offset="45%" stopColor="#7c3aed" />
          <Stop offset="100%" stopColor="#3b0764" />
        </LinearGradient>
        <LinearGradient id={`${g}RibbonFold`} x1="0.5" y1="0" x2="0.5" y2="1">
          <Stop offset="0%" stopColor="#c4b5fd" />
          <Stop offset="100%" stopColor="#4c1d95" />
        </LinearGradient>
      </Defs>
      {/* Ribbon — brand violet, folds peek below disc */}
      <Path
        d="M 12 88 L 24 48 L 38 56 L 50 50 L 62 56 L 76 48 L 88 88 L 72 100 L 50 92 L 28 100 Z"
        fill={`url(#${g}Ribbon)`}
      />
      <Path d="M 24 48 L 50 58 L 38 72 L 22 62 Z" fill={`url(#${g}RibbonFold)`} opacity={0.95} />
      <Path d="M 76 48 L 50 58 L 62 72 L 78 62 Z" fill={`url(#${g}RibbonFold)`} opacity={0.95} />
      {/* Champion rays */}
      {GOLD_RAY_DEG.map((deg) => {
        const rad = (deg * Math.PI) / 180 - Math.PI / 2;
        return (
          <Line
            key={deg}
            x1={cx}
            y1={cy}
            x2={cx + rayLen * Math.cos(rad)}
            y2={cy + rayLen * Math.sin(rad)}
            stroke="#fbbf24"
            strokeOpacity={0.42}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        );
      })}
      <Circle cx={cx} cy={cy} r={38} fill="#fbbf24" opacity={0.12} />
      <G transform={`rotate(-7 ${cx} ${cy})`}>
        <Circle cx={cx} cy={cy} r={31} fill={`url(#${g}Face)`} stroke={`url(#${g}Rim)`} strokeWidth={3.2} />
        <Ellipse cx={38} cy={34} rx={18} ry={14} fill="#FFFFFF" opacity={0.3} />
        <Circle cx={cx} cy={cy} r={22} fill="none" stroke="#FEF3C7" strokeWidth={1.5} opacity={0.55} />
        <SvgText
          x={cx}
          y={cy + 11}
          fontSize={32}
          fontWeight="800"
          fill="#4c1d95"
          textAnchor="middle"
          stroke="#fef08a"
          strokeWidth={1.2}
        >
          1
        </SvgText>
      </G>
      {/* Sparkles */}
      <Path d="M 14 18 L 16 24 L 22 26 L 16 28 L 14 34 L 12 28 L 6 26 L 12 24 Z" fill="#fde68a" opacity={0.95} />
      <Path d="M 84 22 L 86 27 L 91 29 L 86 31 L 84 36 L 82 31 L 77 29 L 82 27 Z" fill="#fde68a" opacity={0.9} />
      <Path d="M 78 12 L 79 16 L 83 17 L 79 18 L 78 22 L 77 18 L 73 17 L 77 16 Z" fill="#fff" opacity={0.75} />
    </Svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type BracketMatchRow = {
  id: string;
  teamA: Team;
  teamB: Team;
  pointsA: number;
  pointsB: number;
  winnerId: string;
  status?: 'scheduled' | 'in_progress' | 'completed';
  bracketRound?: number;
  isBronzeMatch?: boolean;
  orderIndex?: number;
  advanceTeamAFromMatchId?: string;
  advanceTeamBFromMatchId?: string;
  advanceTeamALoserFromMatchId?: string;
  advanceTeamBLoserFromMatchId?: string;
};

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function buildMainLayers(rows: BracketMatchRow[]): BracketMatchRow[][] {
  const main = rows.filter((m) => !m.isBronzeMatch);
  if (main.length === 0) return [];
  const byRound = new Map<number, BracketMatchRow[]>();
  for (const m of main) {
    const r = typeof m.bracketRound === 'number' ? m.bracketRound : 0;
    byRound.set(r, [...(byRound.get(r) ?? []), m]);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  return rounds.map((r) =>
    (byRound.get(r) ?? []).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  );
}

/**
 * Vertical positions: column 0 is a simple stack. Deeper columns center each match between
 * its two feeder matches using advanceTeamAFromMatchId / advanceTeamBFromMatchId (same graph
 * as the data). Falls back to 2i/2i+1 only if feeder ids are missing.
 */
function computeYsFromAdvanceLinks(
  layers: BracketMatchRow[][],
  matchH: number,
  rowGap: number
): number[][] {
  const ROW = matchH + rowGap;
  const ys: number[][] = layers.map((layer) => new Array(layer.length).fill(0));

  if (layers.length === 0) return ys;

  layers[0]!.forEach((_, i) => {
    ys[0]![i] = i * ROW;
  });

  for (let r = 1; r < layers.length; r++) {
    const layer = layers[r]!;
    const prevLayer = layers[r - 1]!;
    const prevYs = ys[r - 1]!;
    const idToIndex = new Map(prevLayer.map((m, idx) => [m.id, idx]));

    layer.forEach((child, i) => {
      const idA = child.advanceTeamAFromMatchId;
      const idB = child.advanceTeamBFromMatchId;
      let y0: number | null = null;
      let y1: number | null = null;
      if (idA) {
        const j = idToIndex.get(idA);
        if (j != null) y0 = prevYs[j] ?? 0;
      }
      if (idB) {
        const j = idToIndex.get(idB);
        if (j != null) y1 = prevYs[j] ?? 0;
      }

      if (y0 != null && y1 != null) {
        ys[r]![i] = (y0 + y1) / 2;
      } else if (y0 != null) {
        ys[r]![i] = y0;
      } else if (y1 != null) {
        ys[r]![i] = y1;
      } else {
        const fi = 2 * i;
        const fj = 2 * i + 1;
        const fa = prevYs[fi] ?? 0;
        const fb = prevYs[fj] ?? fa;
        ys[r]![i] = (fa + fb) / 2;
      }
    });
  }

  return ys;
}

function cx(col: number, colW: number, colGap: number) { return col * (colW + colGap); }

/** Misma lógica que en render: fuentes con piso → la caja debe ser al menos tan alta. */
function scaledFonts(s: number) {
  const fTeam = Math.max(B_FONT_MIN, B_FONT_TM * s);
  const fScore = Math.max(B_FONT_MIN, B_FONT_SC_BRACKET * s);
  const padV = Math.max(3, B_PAD_V * s);
  return { fTeam, fScore, padV };
}

function minMatchHeightForContent(s: number, withPlayerAvatars: boolean): number {
  const { fTeam, fScore, padV } = scaledFonts(s);
  /** Must match `paddingVertical` on the match card — layout height must include it or content is squeezed. */
  const cardPadV = Math.max(3, B_PAD_V * s);
  const avatarH = Math.max(18, B_BRACKET_AVATAR * s);
  const gap = Math.max(2, B_BRACKET_AVATAR_NAME_GAP * s);
  /** Inner stack: teams + score + score margins (`styles.score` marginVertical). */
  const scoreVPad = B_SCORE_MARGIN_V * 2;
  let inner: number;
  if (!withPlayerAvatars) {
    inner = Math.ceil(2 * fTeam + fScore + padV * 2 + scoreVPad);
  } else {
    inner = Math.ceil(2 * (avatarH + gap + fTeam) + fScore + padV * 2 + scoreVPad);
  }
  return inner + 2 * cardPadV;
}

function connPath(
  x0: number, y0: number, y1: number | null, yP: number,
  xNext: number, colW: number, colGap: number, matchH: number
): string {
  const xOut = x0 + colW;
  const mid  = xOut + colGap / 2;
  const y0c  = y0 + matchH / 2;
  const yPc  = yP + matchH / 2;
  if (y1 == null) return `M${xOut} ${y0c} L${mid} ${y0c} L${mid} ${yPc} L${xNext} ${yPc}`;
  const y1c  = y1 + matchH / 2;
  const merY = (y0c + y1c) / 2;
  return [
    `M${xOut} ${y0c} L${mid} ${y0c} L${mid} ${merY}`,
    `M${xOut} ${y1c} L${mid} ${y1c} L${mid} ${merY}`,
    `M${mid} ${merY} L${mid} ${yPc} L${xNext} ${yPc}`,
  ].join(' ');
}

/** Losers of the two semifinals → 3rd-place match: same elbow pattern as the rest of the bracket (no extra segments). */
function brzPath(
  xS: number,
  yS: number,
  xB: number,
  yB: number,
  colW: number,
  colGap: number,
  mH: number
): string {
  const ysc = yS + mH / 2;
  const ybc = yB + mH / 2;
  const xOut = xS + colW;
  const midX = xS + colW + colGap / 2;
  return `M${xOut} ${ysc} L${midX} ${ysc} L${midX} ${ybc} L${xB} ${ybc}`;
}

// ─── Layout computation ───────────────────────────────────────────────────────
type Layout = {
  layers: BracketMatchRow[][];
  ys: number[][];
  bronzeRows: BracketMatchRow[];
  bronzeY: number;
  width: number;
  height: number;
  paths: string[];
  s: number;         // the applied scale factor
  colW: number;
  colGap: number;
  matchH: number;
  rowGap: number;
  colLabelH: number;
  /** Gap title row → match cards (all columns). */
  trophyBand: number;
  /** Medal + gap above “FINAL” title (Final column layout only). */
  medalAboveTitleExtra: number;
};

function bracketFinaleIconHeight(category?: 'Gold' | 'Silver' | 'Bronze'): number {
  if (category === 'Gold') return B_MEDAL_GOLD;
  if (category === 'Silver' || category === 'Bronze') return B_MEDAL_CATEGORY;
  return B_TROPHY;
}

function computeLayout(
  matches: BracketMatchRow[],
  scale: number,
  bracketCategory: 'Gold' | 'Silver' | 'Bronze' | undefined,
  withPlayerAvatars: boolean
): Layout {
  const s       = scale;
  const colW    = B_COL_W   * s;
  const colGap  = B_COL_GAP * s;
  const edgePad = B_EDGE_PAD * s;
  const brzBelow = B_BRZ_BLW * s;
  /** Altura de caja: nunca menor que el texto + padding (evita overflow que “pisa” la caja de abajo). */
  const matchH = Math.max(B_MATCH_H * s, minMatchHeightForContent(s, withPlayerAvatars));
  /** Separación vertical entre partidos: escala + piso para que no se encimen al reducir. */
  const rowGap = Math.max(B_ROW_GAP * s, MIN_ROW_GAP_PX);

  const layers = buildMainLayers(matches);
  if (layers.length === 0) {
    return {
      layers: [],
      ys: [],
      bronzeRows: [],
      bronzeY: 0,
      width: 0,
      height: 0,
      paths: [],
      s,
      colW,
      colGap,
      matchH,
      rowGap,
      colLabelH: 0,
      trophyBand: 0,
      medalAboveTitleExtra: 0,
    };
  }

  const ysRaw = computeYsFromAdvanceLinks(layers, matchH, rowGap);
  const bronzeRows = matches
    .filter((m) => m.isBronzeMatch)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  const byId = new Map(matches.map((m) => [m.id, m]));
  let bronzeY = 0;
  if (bronzeRows.length > 0) {
    const b0 = bronzeRows[0]!;
    const la = b0.advanceTeamALoserFromMatchId ? byId.get(b0.advanceTeamALoserFromMatchId) : undefined;
    const lb = b0.advanceTeamBLoserFromMatchId ? byId.get(b0.advanceTeamBLoserFromMatchId) : undefined;
    const sIdx = Math.max(0, layers.length - 2);
    if (!la || !lb || !layers[sIdx]) {
      bronzeY = Math.max(0, ...ysRaw.flat()) + matchH + brzBelow;
    }
  }

  const colLabelH = Math.max(B_COL_LABEL_H * s, 18);
  /** Same height as rendered finale icon (must match `finaleIconSize` in the component). */
  const finaleIconLayoutH = Math.max(24, bracketFinaleIconHeight(bracketCategory) * s);
  const medalAboveTitleExtra = finaleIconLayoutH + B_GAP_MEDAL_TO_FINAL_TITLE * s;
  const trophyBandTight = B_TRP_AFTER_LABEL * s + B_TRP_UNDER_TROPHY * s;
  const finalColIdx = layers.length - 1;
  /**
   * Final column: reserve space for the medal + “FINAL” band with at least `medalAboveTitleExtra`, but do **not**
   * add that full band on top of `ysRaw` when geometry already places the match lower — otherwise the final card
   * sits too low vs the merge point of the semifinals and vs the rest of the bracket. Bronze column reuses final Y.
   */
  const ys = ysRaw.map((row, r) =>
    row.map((y) =>
      r === finalColIdx
        ? Math.max(y, medalAboveTitleExtra) + colLabelH + trophyBandTight
        : y + colLabelH + trophyBandTight
    )
  );
  bronzeY += colLabelH + trophyBandTight;

  // Same top Y as the final match so the two cards sit on one visual row (medal/title offset is only on the final column).
  if (bronzeRows.length > 0 && ys[finalColIdx]?.length) {
    bronzeY = ys[finalColIdx]![0]!;
  }

  const mainCols = layers.length;
  const hasBronze = bronzeRows.length > 0;
  const width  = cx(mainCols + (hasBronze ? 1 : 0), colW, colGap) + colW + edgePad;
  const maxMainY = Math.max(0, ...ys.flat()) + matchH;
  let height = Math.max(maxMainY, bronzeY + matchH + brzBelow);

  const paths: string[] = [];
  for (let r = 0; r < layers.length - 1; r++) {
    const prev = layers[r]!;
    const next = layers[r + 1]!;
    const idToIndex = new Map(prev.map((m, idx) => [m.id, idx]));

    for (let i = 0; i < next.length; i++) {
      const child = next[i]!;
      const yp = ys[r + 1]![i] ?? 0;
      const idA = child.advanceTeamAFromMatchId;
      const idB = child.advanceTeamBFromMatchId;

      let ya: number | null = null;
      let yb: number | null = null;
      if (idA) {
        const j = idToIndex.get(idA);
        if (j != null) ya = ys[r]![j] ?? 0;
      }
      if (idB) {
        const j = idToIndex.get(idB);
        if (j != null) yb = ys[r]![j] ?? 0;
      }

      if (ya != null && yb != null) {
        paths.push(connPath(cx(r, colW, colGap), ya, yb, yp, cx(r + 1, colW, colGap), colW, colGap, matchH));
      } else if (ya != null) {
        paths.push(connPath(cx(r, colW, colGap), ya, null, yp, cx(r + 1, colW, colGap), colW, colGap, matchH));
      } else if (yb != null) {
        paths.push(connPath(cx(r, colW, colGap), yb, null, yp, cx(r + 1, colW, colGap), colW, colGap, matchH));
      } else {
        const mA = prev[2 * i];
        const mB = prev[2 * i + 1];
        if (mA && mB) {
          const yfa = ys[r]![2 * i] ?? 0;
          const yfb = ys[r]![2 * i + 1] ?? yfa;
          paths.push(connPath(cx(r, colW, colGap), yfa, yfb, yp, cx(r + 1, colW, colGap), colW, colGap, matchH));
        } else if (mA) {
          paths.push(connPath(cx(r, colW, colGap), ys[r]![2 * i] ?? 0, null, yp, cx(r + 1, colW, colGap), colW, colGap, matchH));
        }
      }
    }
  }

  if (hasBronze && bronzeRows[0]) {
    const b = bronzeRows[0]!;
    const la = b.advanceTeamALoserFromMatchId ? byId.get(b.advanceTeamALoserFromMatchId) : undefined;
    const lb = b.advanceTeamBLoserFromMatchId ? byId.get(b.advanceTeamBLoserFromMatchId) : undefined;
    const sIdx = Math.max(0, layers.length - 2);
    if (la && lb && layers[sIdx]) {
      const ia = layers[sIdx]!.findIndex((x) => x.id === la.id);
      const ib = layers[sIdx]!.findIndex((x) => x.id === lb.id);
      const ya = ys[sIdx]?.[ia] ?? 0;
      const yb = ys[sIdx]?.[ib] ?? 0;
      const xBrz = cx(mainCols, colW, colGap);
      const xSemi = cx(sIdx, colW, colGap);
      paths.push(brzPath(xSemi, ya, xBrz, bronzeY, colW, colGap, matchH));
      paths.push(brzPath(xSemi, yb, xBrz, bronzeY, colW, colGap, matchH));
    }
  }

  return {
    layers,
    ys,
    bronzeRows,
    bronzeY,
    width,
    height,
    paths,
    s,
    colW,
    colGap,
    matchH,
    rowGap,
    colLabelH,
    trophyBand: trophyBandTight,
    medalAboveTitleExtra,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────
export type BracketCategoryTab = 'Gold' | 'Silver' | 'Bronze';

type Props = {
  matches: BracketMatchRow[];
  onOpenMatch?: (matchId: string) => void;
  t: (key: string, options?: Record<string, string | number>) => string;
  /** Gold shows a large gold medal; Silver/Bronze use themed medals; omit for classic trophy. */
  category?: BracketCategoryTab;
  /** When set, show player photos (team A above name, team B below). */
  userMap?: Record<string, User>;
};

function BracketTeamBlock({
  team,
  userMap,
  fTeam,
  isWinner,
  label,
  avatarPlacement,
}: {
  team: Team;
  userMap?: Record<string, User>;
  fTeam: number;
  isWinner: boolean;
  label: string;
  /** `above` = photos over the team name; `below` = photos under (second side in the card). */
  avatarPlacement: 'above' | 'below';
}) {
  if (!userMap) {
    return (
      <Text
        style={[styles.teamName, { fontSize: fTeam }, isWinner && styles.winner]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.45}
      >
        {label}
      </Text>
    );
  }
  const ids = (team.playerIds ?? []).filter(Boolean).slice(0, 2);
  const avatarRowStyle =
    avatarPlacement === 'above' ? styles.bracketAvatarsRowAbove : styles.bracketAvatarsRowBelow;
  const avatars = (
    <View style={[styles.bracketAvatarsRow, avatarRowStyle]}>
      {ids.length === 0 ? (
        <>
          <View style={styles.bracketAvatarPlaceholder} />
          <View style={styles.bracketAvatarPlaceholder} />
        </>
      ) : (
        ids.map((pid) => {
          const u = userMap[pid];
          return (
            <View key={pid} style={styles.bracketAvatarWrap}>
              {u ? (
                <Avatar
                  firstName={u.firstName}
                  lastName={u.lastName}
                  gender={u.gender}
                  photoUrl={u.photoUrl}
                  size="xs"
                />
              ) : (
                <Avatar firstName="?" lastName="" size="xs" />
              )}
            </View>
          );
        })
      )}
    </View>
  );
  const name = (
    <Text
      style={[styles.teamName, { fontSize: fTeam }, isWinner && styles.winner]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.45}
    >
      {label}
    </Text>
  );
  return (
    <View style={styles.bracketTeamBlock}>
      {avatarPlacement === 'above' ? (
        <>
          {avatars}
          {name}
        </>
      ) : (
        <>
          {name}
          {avatars}
        </>
      )}
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function CategoryBracketDiagram({ matches, onOpenMatch, t, category, userMap }: Props) {
  const layout = useMemo(
    () => computeLayout(matches, 1, category, Boolean(userMap)),
    [matches, category, userMap]
  );

  const { layers, ys, bronzeRows, bronzeY, width, height, paths, s, colW, colGap, matchH, colLabelH, medalAboveTitleExtra } =
    layout;

  const columnHeadings = useMemo(() => mainBracketColumnHeadings(matches, t), [matches, t]);

  if (layers.length === 0) return null;

  // ── Scaled values ──
  const fTeam   = Math.max(B_FONT_MIN, B_FONT_TM  * s);
  const fScore  = Math.max(B_FONT_MIN, B_FONT_SC_BRACKET * s);
  const padH    = Math.max(4,  B_PAD_H  * s);
  const padV    = Math.max(3,  B_PAD_V  * s);
  const radius  = Math.max(4,  B_RADIUS * s);
  const strokeW = Math.max(1,  B_STROKE * s);
  const finaleIconSize = Math.max(24, bracketFinaleIconHeight(category) * s);

  // Finale badge: above the “FINAL” title row, centered in the final column.
  const finalIdx = layers.length - 1;
  const trophyLeft = cx(finalIdx, colW, colGap) + colW / 2 - finaleIconSize / 2;
  const trophyTop = 0;

  const teamLabel = (team: Team) => team?.name?.trim() || t('tournamentDetail.matchOpponentTbd');

  const renderCard = (m: BracketMatchRow) => {
    const wA = m.winnerId === m.teamA._id;
    const wB = m.winnerId === m.teamB._id;
    const showVs = bracketMatchShouldShowVsPlaceholder(m, matches);
    const scoreLine = showVs ? t('tournamentDetail.bracketMatchVs') : `${m.pointsA} – ${m.pointsB}`;
    const inner = (
      <View
        style={[styles.card, {
          height: matchH, borderRadius: radius,
          paddingHorizontal: padH, paddingVertical: padV,
        }]}
      >
        <BracketTeamBlock
          team={m.teamA}
          userMap={userMap}
          fTeam={fTeam}
          isWinner={wA}
          label={teamLabel(m.teamA)}
          avatarPlacement="above"
        />
        <Text style={[styles.score, showVs && styles.scoreVs, { fontSize: fScore }]}>
          {scoreLine}
        </Text>
        <BracketTeamBlock
          team={m.teamB}
          userMap={userMap}
          fTeam={fTeam}
          isWinner={wB}
          label={teamLabel(m.teamB)}
          avatarPlacement="below"
        />
      </View>
    );
    if (!onOpenMatch) return inner;
    return (
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenMatch(m.id)} accessibilityRole="button">
        {inner}
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <Text style={fixtureBracketSectionTitleStyle}>{t('tournamentDetail.bracketDiagramTitle')}</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        bounces={false}
        style={styles.hScroll}
        contentContainerStyle={styles.hScrollContent}
      >
        <View style={[styles.canvas, { width, height }]}>
        {/* 1. SVG connector lines — rendered first, behind everything */}
        <Svg
          width={width}
          height={height}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.svgLines]}
        >
          {paths.map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke={STROKE_COLOR}
              strokeWidth={strokeW}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>

        {/* 1b. Round name per column (aligned with list headings) */}
        {layers.map((_, r) => (
          <View
            key={`col-h-${r}`}
            pointerEvents="none"
            style={[
              styles.colRoundLabelWrap,
              {
                left: cx(r, colW, colGap),
                top: r === finalIdx ? medalAboveTitleExtra : 0,
                width: colW,
                height: colLabelH,
              },
            ]}
          >
            <Text
              style={[styles.colRoundLabel, { fontSize: Math.max(10, B_BRACKET_ROUND_LABEL_FS * s) }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {bracketRoundTitleDisplay((columnHeadings[r] ?? '').toUpperCase())}
            </Text>
          </View>
        ))}
        {bronzeRows.length > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.colRoundLabelWrap,
              {
                left: cx(layers.length, colW, colGap),
                top: medalAboveTitleExtra,
                width: colW,
                height: colLabelH,
              },
            ]}
          >
            <Text
              style={[styles.colRoundLabel, { fontSize: Math.max(10, B_BRACKET_ROUND_LABEL_FS * s) }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {bracketRoundTitleDisplay(t('tournamentDetail.bracketBronzeHeading').toUpperCase())}
            </Text>
          </View>
        ) : null}

        {/* 2. Match cards — main rounds */}
        {layers.map((layer, r) =>
          layer.map((m, i) => (
            <View
              key={`bracket-${r}-${i}-${m.id}`}
              collapsable={false}
              style={[styles.matchCell, {
                left: cx(r, colW, colGap),
                top: ys[r]![i] ?? 0,
                width: colW,
                height: matchH,
              }]}
            >
              {renderCard(m)}
            </View>
          ))
        )}

        {/* 3. Bronze match cards */}
        {bronzeRows.map((m, bi) => (
          <View
            key={`bracket-bronze-${bi}-${m.id}`}
            collapsable={false}
            style={[styles.matchCell, {
              left: cx(layers.length, colW, colGap),
              top: bronzeY + bi * (matchH + Math.max(B_BRZ_GAP * s, 24)),
              width: colW,
              height: matchH,
            }]}
          >
            {renderCard(m)}
          </View>
        ))}

        {/* 4. Finale badge — gold medal (Gold), medals (Silver/Bronze), or trophy */}
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no"
          style={[
            styles.trophyBadge,
            {
              left: trophyLeft,
              top: trophyTop,
              width: finaleIconSize,
              height: finaleIconSize,
            },
            category === 'Gold' ? styles.goldMedalGlow : null,
          ]}
        >
          {category === 'Gold' ? (
            <GoldMedalSvg size={finaleIconSize} />
          ) : category === 'Silver' ? (
            <MaterialCommunityIcons name="medal" size={finaleIconSize} color="#C8C8D0" />
          ) : category === 'Bronze' ? (
            <MaterialCommunityIcons name="medal" size={finaleIconSize} color="#CD7F32" />
          ) : (
            <Ionicons name="trophy" size={finaleIconSize} color={Colors.yellow} />
          )}
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  hScroll: {
    alignSelf: 'stretch',
  },
  /** Room below the canvas so the OS horizontal scroll indicator does not cover match boxes (esp. Android). */
  hScrollContent: {
    paddingBottom: 14,
    alignItems: 'flex-start',
  },
  canvas: {
    position: 'relative',
    overflow: 'visible',
  },
  svgLines: {
    zIndex: 0,
    elevation: 0,
  },
  matchCell: {
    position: 'absolute',
    zIndex: 4,
    elevation: 6,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  bracketTeamBlock: {
    width: '100%',
    alignItems: 'center',
  },
  bracketAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketAvatarsRowAbove: {
    marginBottom: B_BRACKET_AVATAR_NAME_GAP,
  },
  bracketAvatarsRowBelow: {
    marginTop: B_BRACKET_AVATAR_NAME_GAP,
  },
  bracketAvatarWrap: {
    marginHorizontal: 3,
  },
  bracketAvatarPlaceholder: {
    width: B_BRACKET_AVATAR,
    height: B_BRACKET_AVATAR,
    borderRadius: B_BRACKET_AVATAR / 2,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    marginHorizontal: 3,
  },
  teamName: {
    color: Colors.textSecondary,
    width: '100%',
    textAlign: 'center',
  },
  winner: {
    color: Colors.yellow,
    fontWeight: '700',
  },
  score: {
    color: Colors.text,
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: B_SCORE_MARGIN_V,
  },
  scoreVs: {
    fontWeight: '600',
    fontStyle: 'italic',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  trophyBadge: {
    position: 'absolute',
    zIndex: 2,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Soft glow behind Gold medal (iOS shadow + Android elevation). */
  goldMedalGlow: {
    ...Platform.select({
      ios: {
        shadowColor: '#f59e0b',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.62,
        shadowRadius: 14,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  colRoundLabelWrap: {
    position: 'absolute',
    zIndex: 3,
    elevation: 4,
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  colRoundLabel: {
    color: Colors.yellow,
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.45,
  },
});
