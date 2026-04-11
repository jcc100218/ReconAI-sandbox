// ══════════════════════════════════════════════════════════════════
// shared/season-calendar.js — NFL + league-aware season phase helper
//
// Both Scout and War Room use this to answer:
//   "What phase of the dynasty cycle am I in right now, and how many
//    weeks until the next milestone?"
//
// Scout v1 was only aware of "offseason" via a month heuristic
// (Feb-Aug), which meant Field Intel and Priorities said
// "make a trade this week" in April when the user should really
// be scouting rookies for a June draft.
//
// This module derives its state from the same source War Room's
// calendar tab uses (warroom/js/tabs/calendar.js) — Sleeper league
// settings + league.metadata.draft_date. It is intentionally pure
// and stateless so both apps can call it without any wiring.
//
// Public API:
//   window.SeasonCalendar.getPhase(league?)        → string phase
//   window.SeasonCalendar.getKeyDates(league?)     → { draftDate, tradeDeadline, playoffStart, seasonStart, championshipWeek }
//   window.SeasonCalendar.weeksUntil(target, league?) → number of weeks (may be negative)
//   window.SeasonCalendar.getOffseasonFocus(league?) → 'draft_planning' | 'trade_window' | 'early_offseason' | 'preseason_lineup'
//   window.SeasonCalendar.describe(league?)        → { phase, label, weeksToNext, nextMilestone }
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

(function () {
  'use strict';

  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const MS_PER_DAY  = 24 * 60 * 60 * 1000;

  // Resolve a Sleeper league object from the argument or from window.S
  function _league(leagueRef) {
    if (leagueRef) return leagueRef;
    const S = window.S || window.App?.S;
    if (!S?.leagues?.length) return null;
    return S.leagues.find(l => l.league_id === S.currentLeagueId) || S.leagues[0];
  }

  // Parse a Sleeper metadata.draft_date. Sleeper stores it as a string
  // containing a unix timestamp in ms. Fall back to null if unparseable.
  function _parseDraftDate(meta) {
    const raw = meta?.draft_date;
    if (!raw) return null;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 946684800000 /* Y2K */) return null;
    return new Date(num);
  }

  // Derive all the calendar anchors from a single league object.
  function getKeyDates(leagueRef) {
    const league = _league(leagueRef);
    if (!league) return { draftDate: null, tradeDeadline: null, playoffStart: null, seasonStart: null, championshipWeek: null };
    const settings = league.settings || {};
    const metadata = league.metadata || {};
    const season = parseInt(league.season) || new Date().getFullYear();

    // Season start: NFL Week 1 is typically the first Thursday after Labor Day.
    // War Room approximates it as September 5 of the season year — we do the same.
    const seasonStart = new Date(season, 8, 5); // Month is 0-indexed, so 8 = September

    // Trade deadline: Sleeper stores it as a week number. Convert to a date.
    let tradeDeadline = null;
    if (settings.trade_deadline && settings.trade_deadline > 0) {
      tradeDeadline = new Date(seasonStart.getTime() + (settings.trade_deadline - 1) * MS_PER_WEEK);
    }

    // Playoffs start
    let playoffStart = null;
    let championshipWeek = null;
    if (settings.playoff_week_start && settings.playoff_week_start > 0) {
      playoffStart = new Date(seasonStart.getTime() + (settings.playoff_week_start - 1) * MS_PER_WEEK);
      // 3-week playoff by default (1w per round × 3 rounds); 2w-per-round = 6 weeks
      const playoffWeeks = settings.playoff_round_type === 2 ? 6 : 3;
      championshipWeek = new Date(playoffStart.getTime() + (playoffWeeks - 1) * MS_PER_WEEK);
    }

    // Rookie draft date from metadata (commish sets this in Sleeper)
    const draftDate = _parseDraftDate(metadata);

    return { draftDate, tradeDeadline, playoffStart, seasonStart, championshipWeek };
  }

  // Return the current phase of the dynasty cycle.
  // Phases:
  //   'offseason'       — no league context / fallback
  //   'early_offseason' — after championship, >8 weeks before draft (or draft unknown, winter months)
  //   'pre_draft'       — 1-8 weeks out from the rookie draft
  //   'draft_week'      — within 7 days of the rookie draft
  //   'post_draft'      — rookie draft done, before preseason
  //   'preseason'       — within 4 weeks of NFL Week 1
  //   'regular_season'  — NFL Week 1 through playoff start
  //   'playoffs'        — playoff week through championship week
  function getPhase(leagueRef) {
    const league = _league(leagueRef);
    const now = Date.now();
    // If no league, skip the date-based branches and fall through to the
    // month-based fallback at the bottom so we still return something
    // calendar-aware (e.g. April → 'early_offseason').
    const { draftDate, playoffStart, seasonStart, championshipWeek } = league
      ? getKeyDates(league)
      : { draftDate: null, playoffStart: null, seasonStart: null, championshipWeek: null };

    // Playoffs window (highest priority)
    if (playoffStart && championshipWeek && now >= playoffStart.getTime() && now <= championshipWeek.getTime() + MS_PER_WEEK) {
      return 'playoffs';
    }

    // Regular season: between Week 1 and playoff start
    if (seasonStart && now >= seasonStart.getTime() && (!playoffStart || now < playoffStart.getTime())) {
      return 'regular_season';
    }

    // Preseason: within 4 weeks of Week 1
    if (seasonStart && now < seasonStart.getTime() && (seasonStart.getTime() - now) <= 4 * MS_PER_WEEK) {
      return 'preseason';
    }

    // Rookie draft timeline
    if (draftDate) {
      const draftTs = draftDate.getTime();
      const daysToDraft = Math.round((draftTs - now) / MS_PER_DAY);
      if (daysToDraft > 0 && daysToDraft <= 7) return 'draft_week';
      if (daysToDraft > 7 && daysToDraft <= 8 * 7) return 'pre_draft';
      if (daysToDraft < 0 && Math.abs(daysToDraft) <= 8 * 7) return 'post_draft';
      if (daysToDraft > 8 * 7) return 'early_offseason';
    }

    // Fallback: month-based offseason detection
    const month = new Date(now).getMonth();
    if (month >= 1 && month <= 4)   return 'early_offseason'; // Feb-May
    if (month >= 5 && month <= 6)   return 'pre_draft';       // Jun-Jul (rookie draft window)
    if (month === 7)                return 'preseason';       // August
    return 'offseason';
  }

  // How many weeks until the named target. Negative if the target has passed.
  // target: 'draft' | 'deadline' | 'playoffs' | 'season_start' | 'championship'
  function weeksUntil(target, leagueRef) {
    const dates = getKeyDates(leagueRef);
    const map = {
      draft:        dates.draftDate,
      deadline:     dates.tradeDeadline,
      playoffs:     dates.playoffStart,
      season_start: dates.seasonStart,
      championship: dates.championshipWeek,
    };
    const d = map[target];
    if (!d) return null;
    const diff = d.getTime() - Date.now();
    return Math.round(diff / MS_PER_WEEK);
  }

  // What the user should be focused on if we're in any offseason-ish phase.
  function getOffseasonFocus(leagueRef) {
    const phase = getPhase(leagueRef);
    if (phase === 'pre_draft' || phase === 'draft_week') return 'draft_planning';
    if (phase === 'early_offseason') return 'trade_window';
    if (phase === 'post_draft') return 'early_offseason';
    if (phase === 'preseason') return 'preseason_lineup';
    return 'trade_window';
  }

  // Human-readable description of the current phase + what's next
  function describe(leagueRef) {
    const phase = getPhase(leagueRef);
    const dates = getKeyDates(leagueRef);
    const _w = (t) => weeksUntil(t, leagueRef);

    const labels = {
      offseason:        'Offseason',
      early_offseason:  'Early Offseason',
      pre_draft:        'Rookie Draft Planning',
      draft_week:       'Rookie Draft Week',
      post_draft:       'Post-Draft',
      preseason:        'Preseason',
      regular_season:   'Regular Season',
      playoffs:         'Playoffs',
    };

    let weeksToNext = null;
    let nextMilestone = null;

    if (phase === 'pre_draft' && dates.draftDate) {
      weeksToNext = _w('draft');
      nextMilestone = 'Rookie draft';
    } else if (phase === 'draft_week') {
      weeksToNext = 0;
      nextMilestone = 'Rookie draft (this week)';
    } else if (phase === 'post_draft' && dates.seasonStart) {
      weeksToNext = _w('season_start');
      nextMilestone = 'NFL Week 1';
    } else if (phase === 'preseason' && dates.seasonStart) {
      weeksToNext = _w('season_start');
      nextMilestone = 'NFL Week 1';
    } else if (phase === 'regular_season' && dates.tradeDeadline && _w('deadline') > 0) {
      weeksToNext = _w('deadline');
      nextMilestone = 'Trade deadline';
    } else if (phase === 'regular_season' && dates.playoffStart) {
      weeksToNext = _w('playoffs');
      nextMilestone = 'Playoffs begin';
    } else if (phase === 'playoffs' && dates.championshipWeek) {
      weeksToNext = _w('championship');
      nextMilestone = 'Championship';
    } else if (phase === 'early_offseason' && dates.draftDate) {
      weeksToNext = _w('draft');
      nextMilestone = 'Rookie draft';
    }

    return { phase, label: labels[phase] || 'Offseason', weeksToNext, nextMilestone };
  }

  // Expose
  window.SeasonCalendar = { getPhase, getKeyDates, weeksUntil, getOffseasonFocus, describe };
  window.App.SeasonCalendar = window.SeasonCalendar;
})();
