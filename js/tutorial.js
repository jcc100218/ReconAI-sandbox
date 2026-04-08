// ══════════════════════════════════════════════════════════════════
// js/tutorial.js — First-time user tutorial overlay
// Shows guided tooltips highlighting key app areas on first login.
// Completion stored in localStorage — only shows once.
// ══════════════════════════════════════════════════════════════════

const TUTORIAL_KEY = 'scout_tutorial_done_v1';

const TUTORIAL_STEPS = [
  {
    target: '#panel-digest',
    title: 'Your Daily Brief',
    desc: 'Every time you open Scout, Alex delivers a personalized intel digest — team health, positional gaps, and action items tailored to your roster.',
    position: 'bottom',
  },
  {
    target: '.team-bar',
    title: 'Your Roster at a Glance',
    desc: 'Tap the team bar to expand your full roster. See every player\'s DHQ value, age, and career phase.',
    position: 'bottom',
  },
  {
    target: '.global-chat-row',
    title: 'Search & Ask Scout',
    desc: 'Type a player name to look them up, or ask Scout any question about your league — trades, waivers, draft strategy, anything.',
    position: 'top',
  },
  {
    target: '#mnav-league',
    title: 'League Intel',
    desc: 'Tap League to see every team in your league — their DNA, tier, needs, and how to exploit them in trades.',
    position: 'top',
  },
  {
    target: '#mnav-draft',
    title: 'Draft Command',
    desc: 'Your draft war room — scouting reports, rookie rankings, mock drafts, and AI-powered pick advice based on your league\'s history.',
    position: 'top',
  },
  {
    target: '#mnav-waivers',
    title: 'Waiver Intelligence',
    desc: 'AI-powered waiver recommendations with FAAB bid ranges and confidence levels. Scout finds hidden gems and tells you exactly what to bid.',
    position: 'top',
  },
  {
    target: '#mnav-fieldlog',
    title: 'Field Notes',
    desc: 'Every meaningful action you take — trades proposed, players scouted, waivers claimed — gets logged here. Your personal decision journal.',
    position: 'top',
  },
  {
    target: 'button[title="Settings"]',
    title: 'Settings & Alex',
    desc: 'Customize your experience — choose Alex\'s personality style, connect additional leagues, manage your subscription, and configure AI providers.',
    position: 'bottom',
  },
];

let _tutStep = 0;
let _tutOverlay = null;

function shouldShowTutorial() {
  return !localStorage.getItem(TUTORIAL_KEY);
}

function startTutorial() {
  if (!shouldShowTutorial()) return;
  _tutStep = 0;
  _showStep();
}

function _showStep() {
  if (_tutStep >= TUTORIAL_STEPS.length) {
    _endTutorial();
    return;
  }

  const step = TUTORIAL_STEPS[_tutStep];
  const target = document.querySelector(step.target);

  // Remove previous overlay
  if (_tutOverlay) _tutOverlay.remove();

  // Create overlay
  _tutOverlay = document.createElement('div');
  _tutOverlay.id = 'tutorial-overlay';
  _tutOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;pointer-events:all';

  // Semi-transparent backdrop
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.65)';
  backdrop.onclick = () => _nextStep();
  _tutOverlay.appendChild(backdrop);

  // Tooltip card
  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute;left:16px;right:16px;max-width:360px;margin:0 auto;background:var(--bg2);border:2px solid var(--accent);border-radius:16px;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.5);z-index:10000;pointer-events:all';

  // Position tooltip near target
  if (target) {
    const rect = target.getBoundingClientRect();
    if (step.position === 'top') {
      tooltip.style.bottom = (window.innerHeight - rect.top + 12) + 'px';
      tooltip.style.top = 'auto';
    } else {
      tooltip.style.top = (rect.bottom + 12) + 'px';
    }
    // Highlight target
    target.style.position = target.style.position || 'relative';
    target.style.zIndex = '10001';
    target.style.outline = '2px solid var(--accent)';
    target.style.outlineOffset = '2px';
    target.style.borderRadius = '8px';
  } else {
    // Center if no target found
    tooltip.style.top = '50%';
    tooltip.style.transform = 'translateY(-50%)';
  }

  tooltip.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Step ${_tutStep + 1} of ${TUTORIAL_STEPS.length}</div>
    <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:6px;letter-spacing:-.02em">${step.title}</div>
    <div style="font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:16px">${step.desc}</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button onclick="window._nextStep()" style="flex:1;padding:10px;font-size:14px;font-weight:700;background:linear-gradient(135deg,var(--accent),#b8941f);color:var(--bg1);border:none;border-radius:10px;cursor:pointer;font-family:inherit">${_tutStep < TUTORIAL_STEPS.length - 1 ? 'Next' : 'Get Started'}</button>
      <button onclick="window._endTutorial()" style="padding:10px 14px;font-size:13px;color:var(--text3);background:none;border:none;cursor:pointer;font-family:inherit">Skip</button>
    </div>
  `;

  _tutOverlay.appendChild(tooltip);
  document.body.appendChild(_tutOverlay);
}

function _nextStep() {
  // Clean up previous target highlight
  const prevStep = TUTORIAL_STEPS[_tutStep];
  if (prevStep) {
    const prevTarget = document.querySelector(prevStep.target);
    if (prevTarget) {
      prevTarget.style.zIndex = '';
      prevTarget.style.outline = '';
      prevTarget.style.outlineOffset = '';
    }
  }
  _tutStep++;
  _showStep();
}

function _endTutorial() {
  // Clean up all highlights
  TUTORIAL_STEPS.forEach(step => {
    const el = document.querySelector(step.target);
    if (el) {
      el.style.zIndex = '';
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
  });
  if (_tutOverlay) {
    _tutOverlay.remove();
    _tutOverlay = null;
  }
  localStorage.setItem(TUTORIAL_KEY, '1');
}

// Exports
window._nextStep = _nextStep;
window._endTutorial = _endTutorial;
window.startTutorial = startTutorial;
window.shouldShowTutorial = shouldShowTutorial;
