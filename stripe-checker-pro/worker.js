// Stripe Checker Pro - Cloudflare Worker (Final Working Version)
// Features: Client-side Luhn Validation + Direct BIN Lookup + CC Generator

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Handle OPTIONS preflight for CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        // Serve HTML for all routes
        return new Response(getHTML(), {
            headers: {
                'Content-Type': 'text/html;charset=UTF-8',
                'Cache-Control': 'no-cache'
            }
        });
    }
};

function getHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stripe Checker Pro | Premium Card Validation Tool</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        :root{
            --bg-primary:#0a0a0f;
            --bg-secondary:#12121a;
            --bg-card:#1a1a25;
            --accent-primary:#7c3aed;
            --accent-secondary:#a855f7;
            --accent-gradient:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#6366f1 100%);
            --text-primary:#ffffff;
            --text-secondary:#a1a1aa;
            --success:#10b981;
            --error:#ef4444;
            --warning:#f59e0b;
            --border-color:rgba(124,58,237,.3);
            --glow:0 0 30px rgba(124,58,237,.4)
        }
        body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:var(--bg-primary);color:var(--text-primary);min-height:100vh;overflow-x:hidden}
        .bg-animation{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;background:var(--bg-primary);overflow:hidden}
        .bg-animation::before,.bg-animation::after{content:'';position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(120px);opacity:.15;animation:float 20s ease-in-out infinite}
        .bg-animation::before{background:var(--accent-primary);top:-200px;left:-200px}
        .bg-animation::after{background:var(--accent-secondary);bottom:-200px;right:-200px;animation-delay:-10s}
        @keyframes float{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(100px,50px) scale(1.1)}66%{transform:translate(-50px,100px) scale(.9)}}
        header{text-align:center;padding:40px 20px;position:relative}
        .logo{display:inline-flex;align-items:center;gap:15px;margin-bottom:15px}
        .logo-icon{width:60px;height:60px;background:var(--accent-gradient);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:var(--glow)}
        h1{font-size:2.8rem;font-weight:800;background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-1px}
        .subtitle{color:var(--text-secondary);font-size:1.1rem;margin-top:8px}
        .badge{display:inline-block;background:rgba(124,58,237,.2);border:1px solid var(--border-color);padding:6px 14px;border-radius:20px;font-size:.85rem;color:var(--accent-secondary);margin-top:15px}
        .container{max-width:1400px;margin:0 auto;padding:0 20px 60px}
        .tabs{display:flex;justify-content:center;gap:10px;margin-bottom:30px;flex-wrap:wrap}
        .tab-btn{padding:12px 28px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;color:var(--text-secondary);cursor:pointer;font-size:1rem;font-weight:600;transition:all .3s ease}
        .tab-btn:hover{background:rgba(124,58,237,.15);color:var(--text-primary);border-color:var(--accent-primary)}
        .tab-btn.active{background:var(--accent-gradient);color:white;border-color:transparent;box-shadow:var(--glow)}
        .cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(500px,1fr));gap:25px}
        @media(max-width:600px){.cards-grid{grid-template-columns:1fr}}
        .panel{background:var(--bg-card);border:1px solid var(--border-color);border-radius:20px;padding:28px;backdrop-filter:blur(10px)}
        .panel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:15px;border-bottom:1px solid rgba(255,255,255,.08)}
        .panel-title{font-size:1.3rem;font-weight:700;display:flex;align-items:center;gap:10px}
        .input-area{width:100%;min-height:220px;background:var(--bg-secondary);border:2px solid var(--border-color);border-radius:14px;padding:18px;color:var(--text-primary);font-family:'Consolas','Monaco',monospace;font-size:.95rem;resize:vertical;transition:all .3s ease;line-height:1.6}
        .input-area:focus{outline:none;border-color:var(--accent-primary);box-shadow:0 0 20px rgba(124,58,237,.25)}
        .format-hint{font-size:.82rem;color:var(--text-secondary);margin-top:12px;padding:10px 14px;background:rgba(124,58,237,.08);border-radius:8px;line-height:1.5}
        .format-hint code{background:rgba(124,58,237,.2);padding:2px 8px;border-radius:4px;font-family:'Consolas',monospace;color:var(--accent-secondary)}
        .btn-group{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap}
        .btn{padding:14px 28px;border:none;border-radius:12px;font-size:1rem;font-weight:700;cursor:pointer;transition:all .3s ease;display:flex;align-items:center;gap:8px;flex:1;justify-content:center;min-width:140px}
        .btn-primary{background:var(--accent-gradient);color:white;box-shadow:0 4px 20px rgba(124,58,237,.4)}
        .btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 30px rgba(124,58,237,.5)}
        .btn-secondary{background:rgba(255,255,255,.05);color:var(--text-primary);border:1px solid var(--border-color)}
        .btn-success{background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:white}
        .btn-success:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 25px rgba(16,185,129,.4)}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .generator-inputs{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px}
        @media(max-width:500px){.generator-inputs{grid-template-columns:1fr}}
        .input-group{display:flex;flex-direction:column;gap:8px}
        .input-group label{font-size:.9rem;color:var(--text-secondary);font-weight:600}
        .input-field{padding:14px 16px;background:var(--bg-secondary);border:2px solid var(--border-color);border-radius:10px;color:var(--text-primary);font-size:1rem;font-family:'Consolas',monospace;transition:all .3s ease}
        .input-field:focus{outline:none;border-color:var(--accent-primary)}
        .generator-output{width:100%;min-height:180px;background:var(--bg-secondary);border:2px solid var(--border-color);border-radius:14px;padding:18px;color:var(--text-primary);font-family:'Consolas',monospace;font-size:.9rem;resize:vertical;line-height:1.7}
        .progress-container{margin-top:25px;display:none}
        .progress-container.active{display:block}
        .progress-bar-bg{width:100%;height:10px;background:var(--bg-secondary);border-radius:10px;overflow:hidden}
        .progress-bar-fill{height:100%;background:var(--accent-gradient);border-radius:10px;transition:width .3s ease;width:0%}
        .results-container{margin-top:30px;display:none}
        .results-container.active{display:block}
        .results-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:15px}
        .stats-row{display:flex;gap:15px;flex-wrap:wrap}
        .stat-badge{padding:8px 18px;border-radius:10px;font-weight:700;font-size:.9rem}
        .stat-valid{background:rgba(16,185,129,.15);color:var(--success);border:1px solid rgba(16,185,129,.3)}
        .stat-invalid{background:rgba(239,68,68,.15);color:var(--error);border:1px solid rgba(239,68,68,.3)}
        .stat-total{background:rgba(124,58,237,.15);color:var(--accent-secondary);border:1px solid rgba(124,58,237,.3)}
        .table-wrapper{overflow-x:auto;border-radius:16px;border:1px solid var(--border-color)}
        table{width:100%;border-collapse:collapse;font-size:.92rem}
        th,td{padding:16px 18px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06)}
        th{background:rgba(124,58,237,.1);font-weight:700;color:var(--accent-secondary);text-transform:uppercase;font-size:.8rem}
        tr:hover{background:rgba(124,58,237,.05)}
        .status-badge{padding:6px 14px;border-radius:20px;font-weight:700;font-size:.82rem;display:inline-block}
        .status-valid{background:rgba(16,185,129,.2);color:var(--success)}
        .status-invalid{background:rgba(239,68,68,.2);color:var(--error)}
        .card-number{font-family:'Consolas',monospace;font-weight:600}
        .card-brand{display:flex;align-items:center;gap:8px}
        .brand-icon{width:32px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:900}
        .brand-visa{background:#1434CB;color:white}.brand-mc{background:#EB001B;color:white}.brand-amex{background:#006FCF;color:white}.brand-discover{background:#FF6000;color:white}.brand-jcb{background:#0B4EA2;color:white}.brand-diners{background:#0079BE;color:white}.brand-unknown{background:#444;color:white}
        .bin-info{font-size:.85rem;color:var(--text-secondary);max-width:250px}
        .toast{position:fixed;bottom:30px;right:30px;padding:16px 28px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;color:var(--text-primary);font-weight:600;z-index:1000;transform:translateX(150%);transition:transform .4s cubic-bezier(.68,-.55,.265,1.55);box-shadow:0 10px 40px rgba(0,0,0,.4)}
        .toast.show{transform:translateX(0)}.toast.success{border-left:4px solid var(--success)}.toast.error{border-left:4px solid var(--error)}
        footer{text-align:center;padding:40px 20px;color:var(--text-secondary);font-size:.9rem;border-top:1px solid rgba(255,255,255,.05);margin-top:40px}
        footer a{color:var(--accent-secondary);text-decoration:none}
        .spinner{width:20px;height:20px;border:2px solid transparent;border-top:2px solid currentColor;border-radius:50%;animation:spin .8s linear infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){h1{font-size:2rem}.panel{padding:20px}.btn{padding:12px 20px;font-size:.9rem}th,td{padding:12px 10px;font-size:.82rem}}
    </style>
</head>
<body>
    <div class="bg-animation"></div>
    <header>
        <div class="logo"><div class="logo-icon">💳</div></div>
        <h1>Stripe Checker Pro</h1>
        <p class="subtitle">Premium Card Validation & BIN Lookup Tool</p>
        <span class="badge">✅ Luhn Validation • 🔍 BIN Lookup • 🎲 CC Generator</span>
    </header>
    <main class="container">
        <div class="tabs">
            <button class="tab-btn active" data-tab="checker">🔍 Card Validator</button>
            <button class="tab-btn" data-tab="generator">🎲 CC Generator</button>
        </div>
        <div class="cards-grid">
            <div id="checker-panel" class="panel" style="grid-column:1/-1">
                <div class="panel-header">
                    <h2 class="panel-title"><span>📥</span> Input Cards</h2>
                    <span style="color:var(--text-secondary);font-size:.9rem">Bulk Check Supported</span>
                </div>
                <textarea id="cardInput" class="input-area" placeholder="Enter cards here... One per line

Supported formats:
• 4111111111111111|12|25|123
• 4111111111111111 12/25 123
• 5455123456789012|01|26|456"></textarea>
                <div class="format-hint"><strong>Format:</strong> <code>CCNumber|MM|YY|CVV</code><br>Example: <code>4242424242424242|12|28|123</code></div>
                <div class="btn-group">
                    <button id="checkBtn" class="btn btn-primary" onclick="startChecking()">🔍 Validate All Cards</button>
                    <button class="btn btn-secondary" onclick="clearInput()">🗑️ Clear</button>
                    <button class="btn btn-secondary" onclick="loadSample()">📋 Load Sample</button>
                </div>
                <div id="progressContainer" class="progress-container">
                    <div class="progress-bar-bg"><div id="progressBar" class="progress-bar-fill"></div></div>
                    <p id="progressText" class="progress-text">Processing... 0/0</p>
                </div>
                <div id="resultsContainer" class="results-container">
                    <div class="results-header">
                        <h3 class="results-title">📊 Results</h3>
                        <div class="stats-row">
                            <span id="statTotal" class="stat-badge stat-total">Total: 0</span>
                            <span id="statValid" class="stat-badge stat-valid">✅ Valid: 0</span>
                            <span id="statInvalid" class="stat-badge stat-invalid">❌ Invalid: 0</span>
                            <button class="btn btn-success" style="min-width:auto;padding:10px 20px" onclick="copyValid()">📋 Copy Valid</button>
                            <button class="btn btn-secondary" style="min-width:auto;padding:10px 20px" onclick="exportCSV()">💾 Export CSV</button>
                        </div>
                    </div>
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>#</th><th>Card Number</th><th>Brand</th><th>Expiry</th><th>Luhn</th><th>BIN Info</th></tr></thead>
                            <tbody id="resultsBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div id="generator-panel" class="panel" style="display:none;grid-column:1/-1">
                <div class="panel-header">
                    <h2 class="panel-title"><span>🎲</span> Credit Card Generator</h2>
                    <span style="color:var(--text-secondary);font-size:.9rem">Luhn-Valid Cards from BIN</span>
                </div>
                <div class="generator-inputs">
                    <div class="input-group"><label>🏦 BIN (First 6 digits)</label><input type="text" id="binInput" class="input-field" placeholder="411111" maxlength="8"></div>
                    <div class="input-group"><label>🔢 Quantity to Generate</label><input type="number" id="quantityInput" class="input-field" placeholder="10" value="10" min="1" max="10000"></div>
                </div>
                <div style="margin-bottom:15px">
                    <label style="font-size:.9rem;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:8px">💳 Quick BIN Presets:</label>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-secondary" style="padding:8px 14px;font-size:.8rem;min-width:auto" onclick="setBIN('411111')">Visa</button>
                        <button class="btn btn-secondary" style="padding:8px 14px;font-size:.8rem;min-width:auto" onclick="setBIN('542400')">Mastercard</button>
                        <button class="btn btn-secondary" style="padding:8px 14px;font-size:.8rem;min-width:auto" onclick="setBIN('370000')">Amex</button>
                        <button class="btn btn-secondary" style="padding:8px 14px;font-size:.8rem;min-width:auto" onclick="setBIN('601100')">Discover</button>
                        <button class="btn btn-secondary" style="padding:8px 14px;font-size:.8rem;min-width:auto" onclick="setBIN('353011')">JCB</button>
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="generateCards()">✨ Generate Cards</button>
                    <button class="btn btn-success" onclick="copyGenerated()">📋 Copy All</button>
                    <button class="btn btn-secondary" onclick="pasteToChecker()">➡️ Send to Validator</button>
                </div>
                <textarea id="generatorOutput" class="generator-output" placeholder="Generated cards will appear here...

Format: CC|MM|YY|CVV (All Luhn Valid)"></textarea>
            </div>
        </div>
    </main>
    <footer>
        <p>Stripe Checker Pro • Educational Tool • Free APIs Only</p>
        <p style="margin-top:8px">Powered by <a href="https://binlist.net" target="_blank">binlist.net</a> • Luhn Algorithm</p>
    </footer>
    <div id="toast" class="toast"></div>
    <script>
        let results = [];
        let isChecking = false;

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('checker-panel').style.display = btn.dataset.tab === 'checker' ? '' : 'none';
                document.getElementById('generator-panel').style.display = btn.dataset.tab === 'generator' ? '' : 'none';
            });
        });

        function parseCards(input) {
            if (!input.trim()) return [];
            const lines = input.split(/[\\r\\n]+/).map(l => l.trim()).filter(l => l.length > 0);
            const cards = [];
            for (const line of lines) {
                let card = null;
                if (line.includes('|')) {
                    const parts = line.replace(/\\s+/g, '').split('|');
                    if (parts.length >= 4) card = {cc: parts[0], mm: String(parts[1]).padStart(2,'0'), yy: parts[2].length===4?parts[2].substring(2,4):String(parts[2]).padStart(2,'0'), cvv: parts[3]};
                    else if (parts.length === 3) {const d=String(parts[1]); card={cc: parts[0], mm: d.substring(0,2), yy: d.substring(2,4), cvv: parts[2]};}
                } else {
                    const cleaned=line.replace(/\\//g,' ').replace(/\\s+/g,' ').trim().split(' ');
                    if(cleaned.length>=3){const cc=cleaned[0].replace(/\\D/g,'');let mm='',yy='',cvv='';
                    for(let i=1;i<cleaned.length;i++){const p=cleaned[i].replace(/\\D/g,'');if(p.length===2&&!mm)mm=p;else if(p.length===2&&mm&&!yy)yy=p;else if(p.length>=3&&!cvv)cvv=p;}
                    if(cc&&mm&&yy&&cvv&&/^\\d{13,19}$/.test(cc)) card={cc,mm:String(mm).padStart(2,'0'),yy:String(yy).padStart(2,'0'),cvv};}
                }
                if(card&&card.cc&&/^\\d{13,19}$/.test(card.cc)) cards.push(card);
            }
            return cards;
        }

        function detectBrand(cc){
            if(cc.startsWith('4'))return{name:'Visa',class:'brand-visa',icon:'V'};
            const t=cc.substring(0,2),f=cc.substring(0,4);
            if((t>='51'&&t<='55')||['2221','2222','2223','2224','2225','272'].some(p=>f.startsWith(p)))return{name:'Mastercard',class:'brand-mc',icon:'MC'};
            if(cc.startsWith('34')||cc.startsWith('37'))return{name:'Amex',class:'brand-amex',icon:'AX'};
            if(cc.startsWith('6011')||cc.startsWith('65')||(parseInt(f)>=622126&&parseInt(f)<=622925))return{name:'Discover',class:'brand-discover',icon:'DS'};
            if(parseInt(f)>=3528&&parseInt(f)<=3589)return{name:'JCB',class:'brand-jcb',icon:'JB'};
            if(cc.startsWith('36')||cc.startsWith('38')||cc.startsWith('300'))return{name:'Diners',class:'brand-diners',icon:'DC'};
            return{name:'Unknown',class:'brand-unknown',icon:'?'};
        }

        function luhnCheck(num){
            let sum=0,isEven=false;
            for(let i=num.length-1;i>=0;i--){
                let d=parseInt(num[i],10);
                if(isEven){d*=2;if(d>9)d-=9;}
                sum+=d;isEven=!isEven;
            }
            return sum%10===0;
        }

        async function lookupBIN(bin){
            try{
                const resp=await fetch('https://lookup.binlist.net/'+bin,{headers:{'Accept':'application/json'}});
                if(resp.ok){const d=await resp.json();if(d.scheme)return(d.bank?.name||'Unknown')+' • '+d.country?.name+' • '+d.country?.currency;}
            }catch(e){}
            return 'N/A';
        }

        async function startChecking(){
            const input=document.getElementById('cardInput').value;
            const cards=parseCards(input);
            if(cards.length===0){showToast('Please enter valid card(s)','error');return;}
            if(isChecking)return;
            isChecking=true;results=[];
            const btn=document.getElementById('checkBtn');
            btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Validating...';
            document.getElementById('progressContainer').classList.add('active');
            document.getElementById('resultsContainer').classList.add('active');
            document.getElementById('resultsBody').innerHTML='';
            
            for(let i=0;i<cards.length;i++){
                const card=cards[i];
                document.getElementById('progressBar').style.width=Math.round(((i+1)/cards.length)*100)+'%';
                document.getElementById('progressText').textContent='Processing... '+(i+1)+'/'+cards.length;
                
                const isValid=luhnCheck(card.cc);
                const brand=detectBrand(card.cc);
                const binInfo=await lookupBIN(card.cc.substring(0,6));
                
                results.push({...card,valid:isValid,brand:brand,binInfo:binInfo});
                addResultRow(results[results.length-1],i+1);
                await new Promise(r=>setTimeout(r,100));
            }
            
            updateStats();
            btn.disabled=false;btn.innerHTML='🔍 Validate All Cards';isChecking=false;
            document.getElementById('progressText').textContent='✅ Complete! '+cards.length+' cards validated';
            showToast('Finished! '+results.filter(r=>r.valid).length+' valid cards found','success');
        }

        function addResultRow(result,index){
            const tbody=document.getElementById('resultsBody');
            const masked=result.cc.substring(0,4)+'XXXXXX'+result.cc.substring(result.cc.length-4);
            const row=document.createElement('tr');
            row.innerHTML='<td>'+index+'</td><td class="card-number">'+masked+'</td><td><div class="card-brand"><span class="brand-icon '+result.brand.class+'">'+result.brand.icon+'</span>'+result.brand.name+'</div></td><td>'+result.mm+'/'+result.yy+'</td><td><span class="status-badge status-'+(result.valid?'valid':'invalid')+'">'+(result.valid?'✅ Valid':'❌ Invalid')+'</span></td><td class="bin-info">'+result.binInfo+'</td>';
            tbody.appendChild(row);
        }

        function updateStats(){
            const t=results.length,v=results.filter(r=>r.valid).length,i=t-v;
            document.getElementById('statTotal').textContent='Total: '+t;
            document.getElementById('statValid').textContent='✅ Valid: '+v;
            document.getElementById('statInvalid').textContent='❌ Invalid: '+i;
        }

        function generateCards(){
            const bin=document.getElementById('binInput').value.replace(/\\D/g,'');
            const qty=parseInt(document.getElementById('quantityInput').value)||10;
            if(bin.length<6){showToast('Enter at least 6-digit BIN','error');return;}
            if(qty<1||qty>10000){showToast('Quantity: 1-10,000','error');return;}
            const output=document.getElementById('generatorOutput');
            let gen=[];
            for(let i=0;i<qty;i++){const c=genSingle(bin);gen.push(c.cc+'|'+c.mm+'|'+c.yy+'|'+c.cvv);}
            output.value=gen.join('\\n');showToast('Generated '+qty+' Luhn-valid cards!','success');
        }

        function genSingle(bin){
            let len=bin.startsWith('34')||bin.startsWith('37')?15:16;
            let num=bin;while(num.length<len-1)num+=Math.floor(Math.random()*10);
            num+=calcLuhnDigit(num);
            const now=new Date(),fm=Math.floor(Math.random()*48)+1,ed=new Date(now.getFullYear(),now.getMonth()+fm);
            const mm=String(ed.getMonth()+1).padStart(2,'0'),yy=String(ed.getFullYear()).substring(2);
            let cvv='';for(let i=0;i<(bin.startsWith('34')||bin.startsWith('37')?4:3);i++)cvv+=Math.floor(Math.random()*10);
            return{cc:num,mm,yy,cvv};
        }

        function calcLuhnDigit(n){
            let s=0,e=true;
            for(let i=n.length-1;i>=0;i--){let d=parseInt(n[i],10);if(e){d*=2;if(d>9)d-=9;}s+=d;e=!e;}
            return String((10-(s%10))%10);
        }

        function setBIN(b){document.getElementById('binInput').value=b;}

        function copyGenerated(){const o=document.getElementById('generatorOutput');if(!o.value){showToast('No cards','error');return;}navigator.clipboard.writeText(o.value);showToast('Copied!','success');}

        function pasteToChecker(){const o=document.getElementById('generatorOutput');if(!o.value){showToast('No cards','error');return;}document.getElementById('cardInput').value=o.value;document.querySelector('[data-tab="checker"]').click();showToast('Sent to validator!','success');}

        function copyValid(){const v=results.filter(r=>r.valid).map(r=>r.cc+'|'+r.mm+'|'+r.yy+'|'+r.cvv).join('\\n');if(!v){showToast('No valid cards','error');return;}navigator.clipboard.writeText(v);showToast('Copied '+v.split('\\n').length+' valid cards!','success');}

        function exportCSV(){
            if(!results.length){showToast('No results','error');return;}
            const h=['#','Card','Brand','Expiry','CVV','Luhn','Bank Info'],rows=results.map((r,i)=>[i+1,r.cc,r.brand.name,r.mm+'/'+r.yy,r.cvv,r.valid?'Valid':'Invalid',r.binInfo]);
            const csv=[h,...rows].map(r=>r.join(',')).join('\\n'),blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');
            a.href=url;a.download='cards-'+Date.now()+'.csv';a.click();URL.revokeObjectURL(url);showToast('Exported!','success');
        }

        function clearInput(){document.getElementById('cardInput').value='';document.getElementById('resultsBody').innerHTML='';document.getElementById('resultsContainer').classList.remove('active');document.getElementById('progressContainer').classList.remove('active');results=[];}

        function loadSample(){document.getElementById('cardInput').value='4242424242424242|12|28|123\\n4000056655665556|01|29|456\\n5555555555554444|06|27|789\\n378282246310005|03|28|1234\\n6011111111111117|09|26|456\\n3530111333300000|12|28|123';showToast('Sample loaded!','success');}

        function showToast(m,t='success'){const tEl=document.getElementById('toast');tEl.textContent=m;tEl.className='toast '+t+' show';setTimeout(()=>tEl.classList.remove('show'),3000);}
    </script>
</body>
</html>`;
}
