'use strict';
const PYTHON_EXAMPLES={
  auto:`# 点一次运行，小蛇就会自己走，不需要按键。
# 使用 Python 的函数、循环和标准库规划整张棋盘。
from itertools import cycle

def make_route(n):
    route = ["D"] * (n - 1)
    for x in range(n - 1, 0, -1):
        direction = "S" if x % 2 else "W"
        count = n - 1 if x == n - 1 else n - 2
        route.extend([direction] * count)
        route.append("A")
    route.extend(["W"] * (n - 1))
    return route

print("R")  # 回到左上角，初始一格
print("T")  # 开始 / 继续
await wait()

for command in cycle(make_route(get_state()["size"])):
    if get_state()["status"] == "won":
        break
    print(command)
    await wait()  # 等这一格走完，再发下一条
`,
  square:`# 用函数与循环自动走一个方形。
def side(direction, length):
    for _ in range(length):
        print(direction)

print("R")
print("T")
for direction in ["D", "S", "A", "W"]:
    side(direction, 8)
    await wait()
print("方形完成！")
`,
  basics:`# 真正的 Python：内置函数、类、标准库、文件与异常。
import math
import json
from collections import Counter

class Route:
    def __init__(self, direction, length):
        self.commands = [direction] * length
    def run(self):
        for command in self.commands:
            print(command)

print("R")
print("T")
print("计算结果:", sum(range(10)), math.sqrt(81))
print("计数:", dict(Counter("DDSSAAWW")))
Route("D", 5).run()
await wait()
with open("route.json", "w") as f:
    json.dump(get_state(), f)
with open("route.json") as f:
    print("棋盘状态:", json.load(f))
try:
    1 / 0
except ZeroDivisionError:
    print("异常处理也可以正常使用。")
`
};
const pythonRunner={worker:null,ready:null,readyResolve:null,readyReject:null,runId:0,busy:false,loading:false,version:'',chain:Promise.resolve(),logs:[],renderPending:false};
const editor=$('python-code');
try{editor.value=localStorage.getItem('snake-python-code-v3')??PYTHON_EXAMPLES.auto;}catch{editor.value=PYTHON_EXAMPLES.auto;}
function saveCode(){try{localStorage.setItem('snake-python-code-v3',editor.value);}catch{}}
function programLog(text,kind='output'){
  const prefix=kind==='error'?'错误 · ':kind==='system'?'› ':'';
  pythonRunner.logs.push(prefix+String(text).slice(0,12000));
  pythonRunner.logs=pythonRunner.logs.slice(-180);
  if(pythonRunner.renderPending)return;
  pythonRunner.renderPending=true;
  requestAnimationFrame(()=>{pythonRunner.renderPending=false;$('python-output').textContent=pythonRunner.logs.join('\n');$('python-output').scrollTop=$('python-output').scrollHeight;});
}
function runnerStatus(text){$('python-status').textContent=text;}
function updateRunnerButtons(){
  $('python-run').disabled=pythonRunner.busy;
  $('python-run').textContent=pythonRunner.busy?(pythonRunner.loading?'加载 Python…':'▶ 程序运行中'):'▶ 运行 Python';
  $('python-stop').disabled=!pythonRunner.busy&&!pythonRunner.loading;
}
function runtimeBadge(text,state='loading'){const badge=$('python-runtime');badge.textContent=text;badge.dataset.state=state;}
function terminateRuntime(){
  const reject=pythonRunner.readyReject;pythonRunner.readyResolve=null;pythonRunner.readyReject=null;
  pythonRunner.worker?.terminate();pythonRunner.worker=null;pythonRunner.ready=null;pythonRunner.loading=false;
  reject?.(new Error('Python 加载已取消。'));
}
function ensurePython(){
  if(pythonRunner.ready)return pythonRunner.ready;
  pythonRunner.loading=true;runtimeBadge('正在加载 Python…');updateRunnerButtons();
  pythonRunner.ready=new Promise((resolve,reject)=>{pythonRunner.readyResolve=resolve;pythonRunner.readyReject=reject;});
  pythonRunner.ready.catch(()=>{});
  let worker;
  try{worker=new Worker(new URL('python-worker.js?v=python-v3',document.baseURI),{type:'module'});}
  catch(error){const promise=pythonRunner.ready;terminateRuntime();runtimeBadge('加载失败，可重试','error');return Promise.reject(error);}
  pythonRunner.worker=worker;
  worker.onmessage=event=>{
    if(pythonRunner.worker!==worker)return;
    const m=event.data;
    if(m.type==='ready'){
      pythonRunner.loading=false;pythonRunner.version=m.version;runtimeBadge(`Python ${m.version} 已就绪`,'ready');
      const resolve=pythonRunner.readyResolve;pythonRunner.readyResolve=null;pythonRunner.readyReject=null;resolve?.();updateRunnerButtons();return;
    }
    if(m.type==='loading')return;
    if(m.type==='boot-error'){failRuntime(m.message);return;}
    if(m.type==='system'){programLog(m.text,'system');return;}
    if(m.runId!==pythonRunner.runId||!pythonRunner.busy)return;
    if(m.type==='stdout'){programLog(m.text,m.command?'command':'output');return;}
    if(m.type==='stderr'){programLog(m.text,'error');return;}
    if(m.type==='state'){worker.postMessage({type:'response',runId:m.runId,id:m.id,state:window.snakeGame.snapshot()});return;}
    if(m.type==='command'){
      const respond=async()=>{
        if(pythonRunner.worker!==worker||pythonRunner.runId!==m.runId||!pythonRunner.busy)return;
        try{const snapshot=await window.snakeGame.command(m.command);
          if(pythonRunner.worker===worker&&pythonRunner.busy)worker.postMessage({type:'response',runId:m.runId,id:m.id,state:snapshot});
        }catch(error){if(pythonRunner.worker===worker&&pythonRunner.busy)worker.postMessage({type:'response',runId:m.runId,id:m.id,error:error.message});}
      };
      pythonRunner.chain=pythonRunner.chain.then(respond,respond);return;
    }
    if(m.type==='running'){runnerStatus('Python 正在自动控制小蛇，无需按键。可随时调速、暂停或停止程序。');return;}
    if(m.type==='done'||m.type==='error'){
      pythonRunner.busy=false;window.snakeGame.end(m.type==='error');updateRunnerButtons();
      if(m.type==='error'){programLog(m.message,'error');runnerStatus('程序遇到错误，详情见下方输出。修改后可以重新运行。');}
      else{programLog('程序执行完成。','system');runnerStatus('Python 执行完成；小蛇会沿当前方向继续，可点击暂停。');}
    }
  };
  worker.onerror=event=>{event.preventDefault();if(pythonRunner.worker===worker)failRuntime(event.message||'Python 运行环境发生错误。');};
  return pythonRunner.ready;
}
function failRuntime(message){
  programLog(message,'error');pythonRunner.busy=false;window.snakeGame.end(true);terminateRuntime();
  runtimeBadge('Python 加载失败','error');runnerStatus('解释器加载失败，请检查网络后点击运行重试。');updateRunnerButtons();
}
async function runPythonProgram(){
  if(pythonRunner.busy)return;
  const code=editor.value;if(!code.trim()){runnerStatus('先写一点 Python，或从菜单载入示例。');editor.focus();return;}
  saveCode();pythonRunner.busy=true;const id=++pythonRunner.runId;pythonRunner.chain=Promise.resolve();
  pythonRunner.logs=[];programLog('准备运行 Python…','system');runnerStatus('正在准备 Python 解释器…');updateRunnerButtons();
  try{
    await ensurePython();
    if(id!==pythonRunner.runId||!pythonRunner.busy)return;
    const snapshot=window.snakeGame.begin();
    pythonRunner.worker.postMessage({type:'run',runId:id,code,stdin:$('python-stdin').value,state:snapshot});
  }catch(error){
    if(id!==pythonRunner.runId)return;
    pythonRunner.busy=false;programLog(error.message,'error');runnerStatus('启动失败，点击运行可重试。');updateRunnerButtons();
  }
}
function stopPythonProgram(){
  if(!pythonRunner.busy&&!pythonRunner.loading)return;
  ++pythonRunner.runId;pythonRunner.busy=false;terminateRuntime();window.snakeGame.end(true);
  pythonRunner.chain=Promise.resolve();runtimeBadge('Python 已停止');programLog('程序已停止，小蛇已暂停。','system');
  runnerStatus('程序已停止。修改代码后可再次运行；代码和辅助线都会保留。');updateRunnerButtons();
}
window.stopPythonProgram=stopPythonProgram;
$('python-run').addEventListener('click',runPythonProgram);
$('python-stop').addEventListener('click',stopPythonProgram);
$('python-clear').addEventListener('click',()=>{pythonRunner.logs=[];$('python-output').textContent='';});
$('python-example').addEventListener('change',event=>{
  const code=PYTHON_EXAMPLES[event.target.value];if(!code)return;
  stopPythonProgram();editor.value=code;saveCode();event.target.value='';runnerStatus('示例已载入，点击运行即可。');
});
editor.addEventListener('input',saveCode);
editor.addEventListener('keydown',event=>{
  if(event.key==='Tab'){
    event.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;
    editor.setRangeText('    ',start,end,'end');saveCode();
  }
});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();runPythonProgram();}});
ensurePython().catch(error=>{if(pythonRunner.loading)failRuntime(error.message);});
