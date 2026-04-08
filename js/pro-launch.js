// ══════════════════════════════════════════════════════════════════
// js/pro-launch.js — War Room Scout Pro upgrade page
// Full-screen premium launch experience shown at every tier gate
// ══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // TODO: Replace with live Stripe Checkout URL when payments are configured
  const STRIPE_URL = null;
  const INTEREST_KEY = 'dhq_pro_interest';

  const PRO_FEATURES = [
    {
      icon: '🧠',
      title: 'Full AI Intelligence',
      desc: 'Unlimited Scout chats with deep reasoning — trade analysis, waiver recommendations, draft intelligence, and daily briefings. No daily caps, no throttling.',
      badge: 'Unlimited',
    },
    {
      icon: '🔗',
      title: 'Unlimited Leagues',
      desc: 'Connect all your Sleeper, ESPN, MFL, and Yahoo leagues and switch between them in one tap. Every team, every platform, one dashboard.',
      badge: 'Multi-league',
    },
    {
      icon: '🎯',
      title: 'Owner DNA',
      desc: 'Behavioral profiling that tells you exactly how each opponent trades — their risk tolerance, panic threshold, and what they\'ll accept before you send the offer.',
      badge: 'Exclusive',
    },
    {
      icon: '📋',
      title: 'Field Log Sync',
      desc: 'Everything you scout flows to War Room Core automatically. One source of truth across the whole dynasty.',
      badge: 'Cross-platform',
    },
  ];

  const FAQ_ITEMS = [
    {
      q: 'Can I cancel anytime?',
      a: 'Yes. Cancel with one click from your account settings. No questions asked, no penalty, and you keep access through the end of your billing period.',
    },
    {
      q: 'What happens to my data if I downgrade?',
      a: 'Your data stays — Field Log notes, Owner DNA profiles, and league history are retained. You just lose access to Pro features until you resubscribe.',
    },
    {
      q: 'Do I get War Room Core too?',
      a: 'Scout Pro ($4.99/mo) gives you the full mobile Scout experience. War Room desktop is available separately or as part of the Commissioner Suite.',
    },
    {
      q: 'Is there a free tier?',
      a: 'Yes. Connect one league and get read-only access at no cost. Pro unlocks AI analysis, multi-league, Owner DNA, and advanced analytics.',
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

  // ── Stripe / subscribe handler ─────────────────────────────────
  function handleSubscribe() {
    // Record conversion intent so we can follow up
    try {
      const entry = { ts: Date.now(), tier: typeof getTier === 'function' ? getTier() : 'unknown' };
      localStorage.setItem(INTEREST_KEY, JSON.stringify(entry));
    } catch {}

    if (STRIPE_URL) {
      window.open(STRIPE_URL, '_blank');
      return;
    }

    const toast = typeof showToast === 'function' ? showToast : msg => alert(msg);
    toast('Subscription coming soon — you\'ll be the first to know!');
  }

  // ── DOM ────────────────────────────────────────────────────────
  function _ensureDOM() {
    if (document.getElementById('pro-launch-overlay')) return;

    const el = document.createElement('div');
    el.id = 'pro-launch-overlay';
    el.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'z-index:10002',
      'background:#090909',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
      'opacity:0',
      'transition:opacity .22s ease',
    ].join(';');

    el.innerHTML = `
      <div style="min-height:100vh;max-width:540px;margin:0 auto;padding:0 20px 80px">

        <!-- Sticky close bar -->
        <div style="position:sticky;top:0;z-index:2;display:flex;justify-content:flex-end;padding:14px 0 6px;background:#090909">
          <button id="pro-launch-close"
            style="background:rgba(255,255,255,.09);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-size:20px;line-height:1;font-family:inherit;flex-shrink:0;transition:background .15s"
            onmouseover="this.style.background='rgba(255,255,255,.16)'"
            onmouseout="this.style.background='rgba(255,255,255,.09)'">&#x2715;</button>
        </div>

        <!-- Hero -->
        <div style="text-align:center;padding:12px 0 44px">
          <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.28);border-radius:24px;padding:5px 14px;margin-bottom:24px">
            <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55)">War Room Scout</span>
            <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:linear-gradient(90deg,#d4af37,#f0d060);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Pro</span>
          </div>
          <h1 id="pro-launch-hero-heading" style="font-size:clamp(32px,9vw,48px);font-weight:800;letter-spacing:-.04em;line-height:1.06;margin:0 0 20px;background:linear-gradient(160deg,#ffffff 30%,#d4af37 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Every edge.<br>Every league.<br>No limits.</h1>
          <div style="font-size:15px;color:rgba(255,255,255,.4);margin-bottom:32px;line-height:1.65;max-width:360px;margin-left:auto;margin-right:auto">The full Scout experience — AI analysis, multi-league, Owner DNA, and Field Log across all your teams.</div>
          <div style="display:inline-flex;align-items:baseline;gap:5px;background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.22);border-radius:18px;padding:14px 28px">
            <span style="font-size:44px;font-weight:800;letter-spacing:-.04em;color:#d4af37;line-height:1">$4.99</span>
            <span style="font-size:16px;color:rgba(255,255,255,.3)">/month</span>
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,.22);margin-top:8px">Cancel anytime &middot; No commitment</div>
        </div>

        <!-- Trial recap (shown only if usage data exists) -->
        <div id="pro-launch-recap" style="display:none;background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.16);border-radius:14px;padding:16px 20px;margin-bottom:32px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(212,175,55,.6);margin-bottom:10px">Your trial activity</div>
          <div id="pro-launch-recap-list"></div>
        </div>

        <!-- Feature cards -->
        <div style="margin-bottom:36px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.22);margin-bottom:14px">What Pro unlocks</div>
          <div id="pro-launch-features" style="display:flex;flex-direction:column;gap:10px"></div>
        </div>

        <!-- Primary CTA -->
        <button id="pro-launch-cta"
          style="width:100%;padding:18px;background:linear-gradient(135deg,#d4af37,#b8941f);color:#1a1000;border:none;border-radius:14px;font-size:17px;font-weight:800;cursor:pointer;letter-spacing:-.02em;box-shadow:0 8px 32px rgba(212,175,55,.32);margin-bottom:12px;font-family:inherit;transition:transform .15s,box-shadow .15s"
          onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 14px 48px rgba(212,175,55,.45)'"
          onmouseout="this.style.transform='';this.style.boxShadow='0 8px 32px rgba(212,175,55,.32)'">
          Start Pro &mdash; $4.99/month
        </button>

        <!-- Secondary: continue with free -->
        <div style="text-align:center;margin-bottom:36px">
          <button id="pro-launch-skip"
            style="background:none;border:none;cursor:pointer;font-size:13px;color:rgba(255,255,255,.28);font-family:inherit;padding:10px;transition:color .15s"
            onmouseover="this.style.color='rgba(255,255,255,.55)'"
            onmouseout="this.style.color='rgba(255,255,255,.28)'">
            Continue with Free
          </button>
          <div style="font-size:11px;color:rgba(255,255,255,.15);margin-top:2px">Secure checkout via Stripe &middot; Cancel in one click</div>
        </div>

        <!-- Social proof -->
        <div id="pro-launch-social" style="margin-bottom:36px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:20px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.22);margin-bottom:16px;text-align:center">Trusted by dynasty managers</div>
          <div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:20px;flex-wrap:wrap">
            <div style="background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.18);border-radius:12px;padding:8px 16px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:#d4af37;letter-spacing:-.02em">2,400+</div>
              <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:1px">Dynasty managers</div>
            </div>
            <div style="background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.18);border-radius:12px;padding:8px 16px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:#d4af37;letter-spacing:-.02em">18K+</div>
              <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:1px">Trades analyzed</div>
            </div>
            <div style="background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.18);border-radius:12px;padding:8px 16px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:#d4af37;letter-spacing:-.02em">4.8★</div>
              <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:1px">Avg rating</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:14px 16px">
              <div style="font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin-bottom:8px">"Owner DNA is the most unfair advantage I've ever had in dynasty. I knew what my trade partner would accept before I sent the offer."</div>
              <div style="font-size:11px;color:rgba(255,255,255,.28);font-weight:600">— Sleeper manager, 3-league dynasty player</div>
            </div>
            <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:14px 16px">
              <div style="font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin-bottom:8px">"Finally a tool that thinks about dynasty the way I do. The briefings keep me ahead of the waiver wire every single week."</div>
              <div style="font-size:11px;color:rgba(255,255,255,.28);font-weight:600">— ESPN manager, 5-year dynasty veteran</div>
            </div>
          </div>
        </div>

        <!-- FAQ -->
        <div style="border-top:1px solid rgba(255,255,255,.07);padding-top:28px;margin-bottom:24px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.22);margin-bottom:16px">Common questions</div>
          <div id="pro-launch-faq"></div>
        </div>

        <!-- Manage subscription link (paid users only) -->
        <div id="pro-launch-manage" style="display:none;text-align:center;padding-bottom:8px">
          <button
            onclick="if(typeof showToast==='function')showToast('Subscription management coming soon')"
            style="background:none;border:none;cursor:pointer;font-size:13px;color:rgba(255,255,255,.25);text-decoration:underline;font-family:inherit;padding:8px">
            Manage Subscription
          </button>
        </div>

      </div>`;

    document.body.appendChild(el);
    document.getElementById('pro-launch-close').addEventListener('click', hideProLaunchPage);
    document.getElementById('pro-launch-skip').addEventListener('click', hideProLaunchPage);
  }

  // ── Render helpers ─────────────────────────────────────────────
  function _renderFeatures() {
    const container = document.getElementById('pro-launch-features');
    if (!container) return;
    container.innerHTML = PRO_FEATURES.map((f, i) => `
      <div class="pro-feat-card" style="display:flex;align-items:flex-start;gap:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:17px;opacity:0;transform:translateY(16px);transition:opacity .4s ${(i * 0.1).toFixed(2)}s ease,transform .4s ${(i * 0.1).toFixed(2)}s ease">
        <div style="width:44px;height:44px;border-radius:11px;background:linear-gradient(135deg,rgba(212,175,55,.2),rgba(212,175,55,.05));display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${f.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap">
            <span style="font-size:14px;font-weight:700;color:#fff">${f.title}</span>
            <span style="font-size:10px;font-weight:700;color:#d4af37;background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.22);border-radius:20px;padding:2px 8px;white-space:nowrap;flex-shrink:0;letter-spacing:.04em">${f.badge}</span>
          </div>
          <div style="font-size:13px;color:rgba(255,255,255,.4);line-height:1.58">${f.desc}</div>
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
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,.6);padding:3px 0">
        <span style="color:#d4af37;font-size:10px;font-weight:700;flex-shrink:0">✓</span>${s}
      </div>`).join('');
    wrap.style.display = 'block';
  }

  function _renderFAQ() {
    const container = document.getElementById('pro-launch-faq');
    if (!container) return;
    container.innerHTML = FAQ_ITEMS.map(item => `
      <div style="border-bottom:1px solid rgba(255,255,255,.06)">
        <button onclick="(function(b){var a=b.nextElementSibling,o=a.style.maxHeight==='0px'||!a.style.maxHeight;a.style.maxHeight=o?(a.scrollHeight+'px'):'0px';a.style.opacity=o?'1':'0';b.querySelector('.faq-ch').style.transform=o?'rotate(180deg)':'rotate(0)'})(this)"
          style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 0;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left">
          <span style="font-size:14px;font-weight:600;color:rgba(255,255,255,.65);line-height:1.35">${item.q}</span>
          <svg class="faq-ch" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2.5" style="flex-shrink:0;transition:transform .22s"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div style="max-height:0;overflow:hidden;opacity:0;transition:max-height .28s ease,opacity .22s ease">
          <div style="padding:0 0 15px;font-size:13px;color:rgba(255,255,255,.38);line-height:1.68">${item.a}</div>
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

    // Show with fade-in
    overlay.scrollTop = 0;
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    // Stagger-animate feature cards after first paint
    _animateFeatures();

    // Wire CTA
    const cta = document.getElementById('pro-launch-cta');
    if (cta) cta.onclick = handleSubscribe;
  }

  function hideProLaunchPage() {
    const overlay = document.getElementById('pro-launch-overlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }, 220);
  }

  window.showProLaunchPage  = showProLaunchPage;
  window.hideProLaunchPage  = hideProLaunchPage;
  window.handleSubscribe    = handleSubscribe;
  window.App = window.App || {};
  window.App.showProLaunchPage = showProLaunchPage;
  window.App.hideProLaunchPage = hideProLaunchPage;
  window.App.handleSubscribe   = handleSubscribe;
})();
