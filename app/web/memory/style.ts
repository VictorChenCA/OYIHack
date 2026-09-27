// Scoped styles for the memory explorer (#memory). Injected once by createMemory.
export const CSS = `
#memory.mem-root { position: fixed; inset: 0; background: #05040A; overflow: hidden; font-family: var(--sans, "IBM Plex Sans", sans-serif); color: #D7E0EA; --amber: #FFC47A; --line: rgba(255,196,122,.18); --glass: rgba(12,9,14,.78); }
#memory[hidden] { display: none !important; }
#memory .mem-canvas { position: absolute; inset: 0; cursor: grab; touch-action: none; }
#memory .mem-canvas:active { cursor: grabbing; }
#memory .mem-flash { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(circle at 50% 50%, #FFF8E6 0%, #FFB55A 30%, rgba(200,70,20,.6) 60%, rgba(5,4,10,0) 100%); }
#memory .mem-flash.go { animation: memFlash .9s ease-out forwards; }
@keyframes memFlash { 0% { opacity: 1; transform: scale(.6); } 100% { opacity: 0; transform: scale(2.4); } }

#memory .mem-top { position: absolute; top: 16px; left: 16px; right: 16px; display: flex; align-items: center; gap: 18px; pointer-events: none; }
#memory .mem-top > * { pointer-events: auto; }
#memory .mem-back { font: 600 13px/1 var(--display, Rajdhani, sans-serif); letter-spacing: .12em; text-transform: uppercase; color: #FFE3B0; background: var(--glass); border: 1px solid var(--line); padding: 9px 14px; cursor: pointer; clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); transition: background .15s, color .15s; }
#memory .mem-back:hover { background: rgba(255,196,122,.14); color: #fff; }
#memory .mem-back .k { font: 500 10px var(--mono, monospace); color: #05040A; background: var(--amber); padding: 2px 5px; margin-right: 8px; letter-spacing: 0; }
#memory .mem-title .t1 { font: 700 22px/1 var(--display, Rajdhani, sans-serif); letter-spacing: .32em; color: #FFE9C7; text-shadow: 0 0 18px rgba(255,170,80,.55); }
#memory .mem-title .t2 { font: 500 11px/1.6 var(--mono, monospace); color: rgba(255,210,160,.55); letter-spacing: .08em; text-transform: uppercase; margin-top: 3px; }
#memory .mem-stats { margin-left: auto; display: flex; gap: 18px; align-items: center; background: var(--glass); border: 1px solid var(--line); padding: 8px 14px; backdrop-filter: blur(6px); }
#memory .mem-stats div { display: flex; flex-direction: column; align-items: flex-end; }
#memory .mem-stats b { font: 500 15px/1.1 var(--mono, monospace); color: #FFE3B0; }
#memory .mem-stats span { font: 500 9px/1.3 var(--mono, monospace); color: rgba(215,224,234,.5); text-transform: uppercase; letter-spacing: .12em; }
#memory .mem-stats .brain { flex-direction: row; gap: 6px; align-items: center; font: 500 10px var(--mono, monospace); color: rgba(215,224,234,.7); text-transform: uppercase; letter-spacing: .1em; border-left: 1px solid var(--line); padding-left: 14px; }
#memory .mem-stats .brain i { width: 7px; height: 7px; border-radius: 50%; background: #5CF2B0; box-shadow: 0 0 8px #5CF2B0; }
#memory .mem-stats .brain i.dev { background: #FFC47A; box-shadow: 0 0 8px #FFC47A; }

#memory .mem-search { position: absolute; top: 76px; left: 16px; width: 340px; max-width: calc(100vw - 32px); }
#memory .mem-search input { width: 100%; box-sizing: border-box; font: 500 13px var(--sans, sans-serif); color: #FFF3DE; background: var(--glass); border: 1px solid var(--line); padding: 10px 12px; outline: none; backdrop-filter: blur(6px); }
#memory .mem-search input:focus { border-color: rgba(255,196,122,.6); box-shadow: 0 0 0 1px rgba(255,196,122,.25), 0 0 24px rgba(255,160,70,.15); }
#memory .mem-search input::placeholder { color: rgba(215,224,234,.38); }
#memory .mem-results { display: none; margin-top: 6px; max-height: min(52vh, 460px); overflow: auto; background: var(--glass); border: 1px solid var(--line); backdrop-filter: blur(6px); }
#memory .mem-results.on { display: block; }
#memory .mem-results .rh, #memory .rel .rh, #memory .mem-legend .lh { font: 500 9.5px var(--mono, monospace); letter-spacing: .14em; color: rgba(255,210,160,.55); padding: 8px 12px 6px; text-transform: uppercase; }
#memory .mem-results a { display: block; padding: 7px 12px; text-decoration: none; border-top: 1px solid rgba(255,196,122,.07); }
#memory .mem-results a:hover { background: rgba(255,196,122,.09); }
#memory .mem-results .rt { color: #F2E6D6; font-weight: 500; font-size: 12.5px; display: flex; gap: 7px; align-items: center; }
#memory .mem-results .rs { color: rgba(215,224,234,.48); font: 11px/1.4 var(--sans, sans-serif); margin-top: 2px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
#memory i[style*="--c"] { display: inline-block; flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 6px var(--c); }

#memory .mem-legend { position: absolute; left: 16px; bottom: 16px; background: var(--glass); border: 1px solid var(--line); padding: 2px 0 6px; min-width: 190px; backdrop-filter: blur(6px); }
#memory .mem-legend button { display: flex; width: 100%; align-items: center; gap: 8px; background: none; border: 0; color: #D7E0EA; font: 500 12px var(--sans, sans-serif); padding: 4px 12px; cursor: pointer; text-align: left; }
#memory .mem-legend button:hover { background: rgba(255,196,122,.08); }
#memory .mem-legend button em { margin-left: auto; font: 500 11px var(--mono, monospace); font-style: normal; color: rgba(215,224,234,.5); }
#memory .mem-legend button.off { opacity: .35; }
#memory .mem-hint { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); font: 500 10px var(--mono, monospace); letter-spacing: .1em; color: rgba(215,224,234,.3); text-transform: uppercase; pointer-events: none; white-space: nowrap; }
#memory .mem-status { position: absolute; left: 50%; top: 50%; transform: translate(-50%, 90px); display: none; flex-direction: column; align-items: center; gap: 10px; font: 500 12px var(--mono, monospace); color: rgba(255,226,190,.8); letter-spacing: .08em; text-transform: uppercase; text-align: center; }
#memory .mem-status.on { display: flex; }
#memory .mem-status .err { font: 700 18px var(--display, Rajdhani, sans-serif); letter-spacing: .2em; color: #FF8A7A; }
#memory .mem-status .sub { text-transform: none; color: rgba(215,224,234,.5); max-width: 420px; }
#memory .mem-btn { font: 600 12px var(--display, Rajdhani, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: #05040A; background: var(--amber); border: 0; padding: 7px 16px; cursor: pointer; }
#memory .spin { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255,196,122,.2); border-top-color: #FFC47A; animation: memSpin .8s linear infinite; }
#memory .spin.sm { width: 14px; height: 14px; margin: 16px 0; }
@keyframes memSpin { to { transform: rotate(360deg); } }

#memory .mem-tip { position: fixed; display: none; pointer-events: none; max-width: 340px; background: rgba(10,8,12,.92); border: 1px solid var(--line); padding: 8px 10px; z-index: 3; }
#memory .mem-tip .tt { font-weight: 600; color: #FFF3DE; font-size: 12.5px; }
#memory .mem-tip .ts { font: 10.5px var(--mono, monospace); color: rgba(215,224,234,.5); margin-top: 2px; word-break: break-all; }
#memory .mem-tip .tm { font: 500 10px var(--mono, monospace); color: rgba(255,210,160,.7); margin-top: 5px; display: flex; gap: 6px; align-items: center; text-transform: uppercase; letter-spacing: .06em; }

#memory .mem-drawer { position: absolute; top: 76px; right: 16px; bottom: 16px; width: min(460px, calc(100vw - 32px)); display: flex; flex-direction: column; background: rgba(10,8,13,.9); border: 1px solid var(--line); backdrop-filter: blur(10px); transform: translateX(calc(100% + 24px)); transition: transform .28s cubic-bezier(.2,.8,.2,1); box-shadow: -20px 0 60px rgba(0,0,0,.45); }
#memory .mem-drawer.open { transform: none; }
#memory .mem-dhead { position: relative; padding: 14px 44px 12px 16px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, rgba(255,170,80,.08), transparent); }
#memory .mem-dhead .dk { font: 500 10px var(--mono, monospace); color: rgba(255,210,160,.7); letter-spacing: .12em; text-transform: uppercase; display: flex; gap: 7px; align-items: center; }
#memory .mem-dhead .dt { font: 700 21px/1.15 var(--display, Rajdhani, sans-serif); color: #FFF3DE; margin-top: 6px; letter-spacing: .02em; }
#memory .mem-dhead .ds { font: 11px var(--mono, monospace); color: rgba(215,224,234,.45); margin-top: 4px; word-break: break-all; }
#memory .mem-x { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; background: none; border: 1px solid var(--line); color: #FFE3B0; font-size: 18px; line-height: 1; cursor: pointer; }
#memory .mem-x:hover { background: rgba(255,196,122,.12); }
#memory .mem-dbody { flex: 1; overflow: auto; padding: 4px 16px 18px; }
#memory .md { font-size: 13px; line-height: 1.6; color: #D7E0EA; }
#memory .md h2, #memory .md h3, #memory .md h4 { font-family: var(--display, Rajdhani, sans-serif); color: #FFE3B0; letter-spacing: .04em; margin: 18px 0 6px; line-height: 1.2; }
#memory .md h2 { font-size: 19px; } #memory .md h3 { font-size: 16px; } #memory .md h4 { font-size: 14px; text-transform: uppercase; letter-spacing: .1em; }
#memory .md p { margin: 8px 0; } #memory .md ul, #memory .md ol { padding-left: 20px; margin: 6px 0; }
#memory .md strong { color: #FFF3DE; } #memory .md a { color: #FFC47A; text-decoration: none; border-bottom: 1px dotted rgba(255,196,122,.5); }
#memory .md code { font: 12px var(--mono, monospace); background: rgba(255,196,122,.08); color: #FFD9A8; padding: 1px 4px; }
#memory .md pre { background: rgba(0,0,0,.4); border: 1px solid rgba(255,196,122,.1); padding: 10px 12px; overflow: auto; }
#memory .md pre code { background: none; padding: 0; color: #E8D8C4; }
#memory .md blockquote { margin: 8px 0; padding-left: 10px; border-left: 2px solid rgba(255,196,122,.4); color: rgba(215,224,234,.7); }
#memory .md hr { border: 0; border-top: 1px solid var(--line); }
#memory .muted { color: rgba(215,224,234,.5); }
#memory .rel { margin-top: 16px; border-top: 1px solid var(--line); }
#memory .rel .rh { padding-left: 0; }
#memory .rel a { display: flex; gap: 8px; align-items: center; padding: 4px 0; color: #D7E0EA; text-decoration: none; font-size: 12.5px; }
#memory .rel a:hover { color: #FFE3B0; }
@media (max-width: 720px) { #memory .mem-stats { display: none; } #memory .mem-hint { display: none; } #memory .mem-legend { display: none; } }
`;
