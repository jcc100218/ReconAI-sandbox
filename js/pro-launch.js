// ══════════════════════════════════════════════════════════════════
// js/pro-launch.js — War Room Scout Pro upgrade page
// Full-screen premium launch experience shown at every tier gate
// ══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // TODO: Replace with live Stripe URL when payments are configured
  const STRIPE_URL = null;

  const PRO_FEATURES = [
    {
      icon: '🧠',
      title: 'AI Intelligence',
      desc: 'Unlimited Scout chat, trade analysis, waiver recommendations, and draft intelligence — no daily caps.',
    },
    {
      icon: '🏆',
      title: 'Unlimited Leagues',
      desc: 'Connect and switch between all your leagues across Sleeper, ESPN, MFL, and Yahoo instantly.',
    },
    {
      icon: '🧬',
      title: 'Owner DNA',
      desc: 'Deep behavioral profiles on every owner in your league. Know who panics, who holds, who overpays.',
    },
    {
      icon: '📋',
      title: 'Field Log Sync',
      desc: 'Your scouting notes sync across devices and persist through the entire season.',
    },
  ];

  const FAQ_ITEMS = [
    {
      q: 'Can I cancel anytime?',
      a: 'Yes. Cancel with one click from your account settings. No questions asked, no penalty.',
    },
    {
      q: 'What happens to my data if I cancel?',
      a: 'Your Field Log notes, Owner DNA profiles, and league history are retained for 90 days so you can resubscribe without losing anything.',
    },
    {
      q: 'Does Pro include War Room?',
      a: 'Scout Pro ($4.99/mo) gives you full Scout features on mobile. War Room desktop is available separately or as part of the full Suite.',
    },
    {
      q: 'Is there a free tier?',
      a: 'Yes. Connect one league and get read-only access at no cost. Pro unlocks AI, multi-league, and advanced analytics.',
    },
  ];

  // ── Trial recap ────────────────────────────────────────────────
  function _getTrialRecap() {
    try {
      const raw = localStorage.getItem('dhq_trial_usage');
      if (!raw) return [];
      const u = JSON.parse(raw);
      return [
        u.trade_scenarios_explored > 0 && `${u.trade_scenarios_explored} trade scenario${u.trade_scenarios_explored !== 1 ? 's' : ''} explored`,
        u.briefings_received > 0       && `${u.briefings_received} daily briefing${u.briefings_received !== 1 ? 's' : ''} received`,
        u.draft_targets_flagged > 0    && `${u.draft_targets_flagged} draft target${u.draft_targets_flagged !== 1 ? 's' : ''} flagged`,
        u.ai_chats_sent > 0            && `${u.ai_chats_sent} Scout message${u.ai_chats_sent !== 1 ? 's' : ''} sent`,
        u.owner_dna_views > 0          && `${u.owner_dna_views} owner profile${u.owner_dna_views !== 1 ? 's' : ''} viewed`,
        u.waiver_bids_placed > 0       && `${u.waiver_bids_placed} waiver recommendation${u.waiver_bids_placed !== 1 ? 's' : ''} used`,
      ].filter(Boolean);
    } catch { return []; }
  }

  // ── DOM ────────────────────────────────────────────────────────
  function _ensureDOM() {
    if (document.getElementById('pro-launch-overlay')) return;

    const el = document.createElement('div');
    el.id = 'pro-launch-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:10001;background:#0a0a0a;overflow-y:auto;-webkit-overflow-scrolling:touch';

    el.innerHTML = `
      <div style="min-height:100vh;max-width:520px;margin:0 auto;padding:0 20px 72px">

        <!-- Sticky close bar -->
        <div style="position:sticky;top:0;z-index:2;display:flex;justify-content:flex-end;padding:14px 0 6px;background:#0a0a0a">
          <button id="pro-launch-close" style="background:rgba(255,255,255,.09);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-size:20px;line-height:1;font-family:inherit;flex-shrink:0;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,.16)'" onmouseout="this.style.background='rgba(255,255,255,.09)'">&#x2715;</button>
        </div>

        <!-- Hero -->
        <div style="text-align:center;padding:10px 0 40px">
          <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.28);border-radius:24px;padding:5px 14px;margin-bottom:22px">
            <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6)">War Room Scout</span>
            <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:linear-gradient(90deg,#d4af37,#f0d060);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Pro</span>
          </div>
          <h1 style="font-size:clamp(30px,8vw,44px);font-weight:800;letter-spacing:-.04em;line-height:1.08;margin:0 0 18px;background:linear-gradient(160deg,#ffffff 35%,#d4af37 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Every edge.<br>Every league.<br>No limits.</h1>
          <div style="font-size:15px;color:rgba(255,255,255,.45);margin-bottom:28px;line-height:1.6;max-width:360px;margin-left:auto;margin-right:auto">The full Scout experience — AI analysis, multi-league, Owner DNA, and Field Log across all your teams.</div>
          <div style="display:inline-flex;align-items:baseline;gap:5px;background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.2);border-radius:16px;padding:12px 24px">
            <span style="font-size:40px;font-weight:800;letter-spacing:-.04em;color:#d4af37;line-height:1">$4.99</span>
            <span style="font-size:15px;color:rgba(255,255,255,.35)">/month</span>
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,.25);margin-top:8px">Cancel anytime &middot; No commitment</div>
        </div>

        <!-- Trial recap (shown if usage data exists) -->
        <div id="pro-launch-recap" style="display:none;background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.16);border-radius:14px;padding:16px 20px;margin-bottom:28px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(212,175,55,.6);margin-bottom:10px">Your trial activity</div>
          <div id="pro-launch-recap-list"></div>
        </div>

        <!-- Feature cards -->
        <div style="margin-bottom:32px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.25);margin-bottom:12px">What Pro unlocks</div>
          <div id="pro-launch-features" style="display:flex;flex-direction:column;gap:10px"></div>
        </div>

        <!-- Primary CTA -->
        <button id="pro-launch-cta" style="width:100%;padding:17px;background:linear-gradient(135deg,#d4af37,#b8941f);color:#1a1000;border:none;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;letter-spacing:-.02em;box-shadow:0 8px 32px rgba(212,175,55,.3);margin-bottom:12px;font-family:inherit;transition:transform .15s,box-shadow .15s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 14px 44px rgba(212,175,55,.42)'" onmouseout="this.style.transform='';this.style.boxShadow='0 8px 32px rgba(212,175,55,.3)'">
          Start Pro &mdash; $4.99/month
        </button>
        <div style="text-align:center;font-size:12px;color:rgba(255,255,255,.22);margin-bottom:36px">Secure checkout via Stripe &middot; Cancel in one click</div>

        <!-- FAQ -->
        <div style="border-top:1px solid rgba(255,255,255,.07);padding-top:28px;margin-bottom:24px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.25);margin-bottom:16px">Common questions</div>
          <div id="pro-launch-faq"></div>
        </div>

        <!-- Manage subscription link (paid users) -->
        <div id="pro-launch-manage" style="display:none;text-align:center">
          <button onclick="if(typeof showToast==='function')showToast('Subscription management coming soon')" style="background:none;border:none;cursor:pointer;font-size:13px;color:rgba(255,255,255,.28);text-decoration:underline;font-family:inherit;padding:8px">Manage Subscription</button>
        </div>
      </div>`;

    document.body.appendChild(el);
    document.getElementById('pro-launch-close').addEventListener('click', hideProLaunchPage);
  }

  // ── Render helpers ─────────────────────────────────────────────
  function _renderFeatures() {
    const container = document.getElementById('pro-launch-features');
    if (!container) return;
    container.innerHTML = PRO_FEATURES.map((f, i) => `
      <div class="pro-feat-card" style="display:flex;align-items:flex-start;gap:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:16px;opacity:0;transform:translateY(14px);transition:opacity .38s ${(i * 0.09).toFixed(2)}s ease,transform .38s ${(i * 0.09).toFixed(2)}s ease">
        <div style="width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,rgba(212,175,55,.18),rgba(212,175,55,.05));display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${f.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="font-size:14px;font-weight:700;color:#fff">${f.title}</span>
            <span style="font-size:10px;font-weight:700;color:#d4af37;background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.22);border-radius:20px;padding:2px 8px;white-space:nowrap;flex-shrink:0;letter-spacing:.04em">PRO</span>
          </div>
          <div style="font-size:13px;color:rgba(255,255,255,.45);line-height:1.55">${f.desc}</div>
        </div>
      </div>`).join('');
  }

  function _animateFeatures() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('#pro-launch-features .pro-feat-card').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    }));
  }

  function _renderRecap() {
    const wrap = document.getElementById('pro-launch-recap');
    const list = document.getElementById('pro-launch-recap-list');
    if (!wrap || !list) return;
    const stats = _getTrialRecap();
    if (!stats.length) { wrap.style.display = 'none'; return; }
    list.innerHTML = stats.map(s => `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,.65);padding:2px 0">
        <span style="color:#d4af37;font-size:10px;font-weight:700;flex-shrink:0">✓</span>${s}
      </div>`).join('');
    wrap.style.display = 'block';
  }

  function _renderFAQ() {
    const container = document.getElementById('pro-launch-faq');
    if (!container) return;
    container.innerHTML = FAQ_ITEMS.map(item => `
      <div style="border-bottom:1px solid rgba(255,255,255,.06)">
        <button onclick="(function(b){var a=b.nextElementSibling,o=a.style.maxHeight==='0px'||!a.style.maxHeight;a.style.maxHeight=o?(a.scrollHeight+'px'):'0px';a.style.opacity=o?'1':'0';b.querySelector('.faq-ch').style.transform=o?'rotate(180deg)':'rotate(0)'})(this)" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left">
          <span style="font-size:14px;font-weight:600;color:rgba(255,255,255,.7);line-height:1.3">${item.q}</span>
          <svg class="faq-ch" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2.5" style="flex-shrink:0;transition:transform .22s"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div style="max-height:0;overflow:hidden;opacity:0;transition:max-height .28s ease,opacity .22s ease">
          <div style="padding:0 0 14px;font-size:13px;color:rgba(255,255,255,.42);line-height:1.65">${item.a}</div>
        </div>
      </div>`).join('');
  }

  // ── ESC key ────────────────────────────────────────────────────
  let _escBound = false;
  function _bindEsc() {
    if (_escBound) return;
    _escBound = true;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideProLaunchPage(); });
  }

  // ── Public API ─────────────────────────────────────────────────
  function showProLaunchPage() {
    _ensureDOM();
    _bindEsc();

    const overlay = document.getElementById('pro-launch-overlay');
    if (!overlay) return;

    // Manage subscription section — only for paid users
    const tier = typeof getTier === 'function' ? getTier() : 'free';
    const manageEl = document.getElementById('pro-launch-manage');
    if (manageEl) manageEl.style.display = tier === 'paid' ? '' : 'none';

    // Populate content
    _renderFeatures();
    _renderFAQ();
    _renderRecap();

    // Show
    overlay.scrollTop = 0;
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Stagger-fade feature cards after first paint
    _animateFeatures();

    // CTA
    const cta = document.getElementById('pro-launch-cta');
    if (cta) {
      cta.onclick = function () {
        if (STRIPE_URL) {
          window.open(STRIPE_URL, '_blank');
        } else {
          const t = typeof showToast === 'function' ? showToast : msg => alert(msg);
          t('Pro launch coming soon — stay tuned!');
        }
      };
    }
  }

  function hideProLaunchPage() {
    const overlay = document.getElementById('pro-launch-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  window.showProLaunchPage = showProLaunchPage;
  window.hideProLaunchPage = hideProLaunchPage;
  window.App = window.App || {};
  window.App.showProLaunchPage = showProLaunchPage;
  window.App.hideProLaunchPage = hideProLaunchPage;
})();
