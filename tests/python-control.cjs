const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function makeGame() {
  let now = 0, nextId = 0;
  const timers = new Map();
  const paint = new Proxy({}, {get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const elements = new Map();
  function element(id) {
    if(!elements.has(id)) elements.set(id, {
      textContent:'',value:id==='speed'?'300':'',style:{},dataset:{},listeners:new Map(),classList:{toggle(){}},
      addEventListener(type,callback){this.listeners.set(type,callback);},
      click(){this.listeners.get('click')?.({target:this});},
      getContext(){return paint;},getBoundingClientRect(){return {width:576,height:576,left:0,top:0};}
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>element('wrap'),addEventListener(){}},
    window:{devicePixelRatio:1},localStorage:{getItem:()=>null,setItem(){}},
    ResizeObserver:class{observe(){}},performance:{now:()=>now},
    setTimeout(fn,ms){const id=++nextId;timers.set(id,{fn,at:now+ms});return id;},
    clearTimeout(id){timers.delete(id);}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/game.js'),'utf8'),context);
  return {
    api:context.window.snakeGame,
    click(id){element(id).click();},
    setIntervalSlider(ms){
      const slider=element('speed');
      slider.value=String(ms);
      slider.listeners.get('input')({target:slider});
    },
    snapshot(){return JSON.parse(JSON.stringify(context.window.snakeGame.snapshot()));},
    run(code){return vm.runInContext(code,context);},
    advance(ms){
      const target=now+ms;
      for(;;){
        const next=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next)break;
        now=next[1].at;timers.delete(next[0]);next[1].fn();
      }
      now=target;
    },
    time(){return now;},
    timers
  };
}

test('one printed command moves immediately, then blocks completion for 300 ms',async()=>{
  const g=makeGame();g.api.begin();
  let done=false;const pending=g.api.command('D').then(()=>{done=true;});
  assert.deepEqual(g.snapshot().head,[1,0]);
  g.advance(299);await Promise.resolve();assert.equal(done,false);
  g.advance(1);await pending;assert.equal(done,true);
  g.advance(1000);assert.deepEqual(g.snapshot().head,[1,0]);
  g.api.end(true);g.advance(1000);assert.deepEqual(g.snapshot().head,[1,0]);
});

test('the reported 100 x 10 loop completes without a game-over exception',async()=>{
  const g=makeGame();g.api.begin();
  let completed=0;
  for(let outer=0;outer<100;outer++){
    for(let inner=0;inner<10;inner++){
      const pending=g.api.command('D');g.advance(300);await pending;completed++;
    }
  }
  assert.equal(completed,1000);
  assert.equal(g.time(),300000);
  assert.equal(g.snapshot().status,'over');
  assert.deepEqual(g.snapshot().head,[23,0]);
  await g.api.command('R');
  assert.deepEqual(g.snapshot().snake,[[0,0]]);
  const next=g.api.command('S');g.advance(300);await next;
  assert.deepEqual(g.snapshot().head,[0,1]);
});

test('T resumes processing without an independent movement timer',async()=>{
  const g=makeGame();g.api.begin();
  await g.api.command('T');await g.api.command('T');g.advance(2000);
  assert.deepEqual(g.snapshot().head,[0,0]);
  const pending=g.api.command('S');g.advance(300);await pending;
  assert.deepEqual(g.snapshot().head,[0,1]);
});

test('pausing a cooldown retains the remaining delay and does not repeat the move',async()=>{
  const g=makeGame();g.api.begin();
  let done=false;const pending=g.api.command('D').then(()=>{done=true;});
  g.advance(100);g.run('togglePlay()');g.advance(1000);
  await Promise.resolve();assert.equal(done,false);assert.deepEqual(g.snapshot().head,[1,0]);
  g.run('togglePlay()');g.advance(199);await Promise.resolve();assert.equal(done,false);
  g.advance(1);await pending;assert.deepEqual(g.snapshot().head,[1,0]);
});

test('a command queued while manually paused waits before moving',async()=>{
  const g=makeGame();g.api.begin();g.run('togglePlay();togglePlay()');
  const pending=g.api.command('D');g.advance(1000);assert.deepEqual(g.snapshot().head,[0,0]);
  g.run('togglePlay()');assert.deepEqual(g.snapshot().head,[1,0]);
  g.advance(300);await pending;
});

test('stopping during the automatic delay cancels remaining work immediately',async()=>{
  const g=makeGame();g.api.begin();
  const rejected=g.api.command('D').catch(error=>error.message);
  g.advance(50);g.api.end(true);
  assert.equal(await rejected,'程序已停止。');
  assert.equal(g.timers.size,0);g.advance(1000);
  assert.deepEqual(g.snapshot().head,[1,0]);assert.equal(g.snapshot().status,'paused');
});

test('a prohibited reversal is a game notice, rather than a Python exception',async()=>{
  const g=makeGame();g.api.begin();g.run('food={x:1,y:0}');
  let pending=g.api.command('D');g.advance(300);await pending;
  pending=g.api.command('A');g.advance(300);const result=await pending;
  assert.match(result.notice,/不能直接反向/);assert.deepEqual(g.snapshot().head,[1,0]);
});

test('manual speed controls continue to drive automatic manual play',()=>{
  const g=makeGame();g.setIntervalSlider(500);g.run('reset();togglePlay()');
  g.advance(499);assert.deepEqual(g.snapshot().head,[0,0]);
  g.advance(1);assert.deepEqual(g.snapshot().head,[1,0]);
});

test('the same slider sets manual movement and updates a pending Python delay',async()=>{
  const g=makeGame();g.setIntervalSlider(120);g.click('play');
  g.advance(119);assert.deepEqual(g.snapshot().head,[0,0]);
  g.advance(1);assert.deepEqual(g.snapshot().head,[1,0]);
  g.api.begin();
  let done=false;
  const pending=g.api.command('D').then(()=>{done=true;});
  g.advance(40);g.setIntervalSlider(200);
  g.advance(159);await Promise.resolve();
  assert.equal(done,false);assert.deepEqual(g.snapshot().head,[1,0]);
  g.advance(1);await pending;
  assert.deepEqual(g.snapshot().head,[1,0]);
  assert.equal(g.snapshot().speed,5);
});

test('Restart stops manual play and keeps the initial one-cell snake stationary',()=>{
  const g=makeGame();g.setIntervalSlider(500);g.run('togglePlay()');g.advance(2000);
  assert.deepEqual(g.snapshot().head,[4,0]);
  g.click('restart');g.advance(10000);
  assert.deepEqual(g.snapshot().snake,[[0,0]]);assert.equal(g.snapshot().status,'ready');
  assert.equal(g.timers.size,0);
});

test('Restart during a Python delay cancels the pending command and leaves no stale movement',async()=>{
  const g=makeGame();g.api.begin();
  const cancelled=g.api.command('D').catch(error=>error.message);
  g.advance(100);g.click('restart');
  assert.equal(await cancelled,'程序已停止。');
  g.advance(10000);assert.deepEqual(g.snapshot().snake,[[0,0]]);
  assert.equal(g.snapshot().score,0);assert.equal(g.snapshot().status,'ready');assert.equal(g.timers.size,0);
});

test('each Python run resets after both a previous run and a game over',async()=>{
  const g=makeGame();g.api.begin();
  let pending=g.api.command('D');g.advance(300);await pending;g.api.end(true);
  let initial=g.api.begin();
  assert.deepEqual(Array.from(initial.head),[0,0]);assert.equal(initial.snake.length,1);
  g.advance(3000);assert.deepEqual(g.snapshot().head,[0,0]);
  pending=g.api.command('W');g.advance(300);await pending;
  assert.equal(g.snapshot().status,'over');g.api.end(true);
  initial=g.api.begin();assert.equal(initial.status,'ready');assert.equal(initial.score,0);
  assert.deepEqual(Array.from(initial.head),[0,0]);
  pending=g.api.command('S');assert.deepEqual(g.snapshot().head,[0,1]);g.advance(300);await pending;
});

test('automatic Python reset preserves the user drawing and saved speed',()=>{
  const g=makeGame();g.setIntervalSlider(200);g.run('guides=[{type:"line",points:[{x:1,y:2},{x:3,y:4}]}]');
  g.api.begin();assert.equal(g.snapshot().speed,5);assert.equal(g.run('guides.length'),1);
  g.click('restart');assert.equal(g.run('guides.length'),1);assert.equal(g.snapshot().speed,5);
});
