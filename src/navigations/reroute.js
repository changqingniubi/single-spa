import { started } from "../start";
import { getAppChanges } from "../applications/app";
import { toLoadPromise } from "../lifecycles/load";
import { toUnmountPromise } from "../lifecycles/unmount";
import { toBootstrapPromise } from "../lifecycles/bootstrap";
import { toMountPromise } from "../lifecycles/mount";

//import './navigator-events'
import {callCapturedEventListeners} from './navigator-events'

let appChangeUnderway = false,
  peopleWaitingOnAppChange = [];
// 核心应用处理方法
export function reroute(pendingPromises = [], eventArguments) {
    if (appChangeUnderway) {
        return new Promise((resolve, reject) => {
            peopleWaitingOnAppChange.push({
                resolve,
                reject,
                eventArguments
            })
        });
    }
    //  需要获取要加载的应用
    //  需要获取要被挂载的应用
    //  哪些应用需要被卸载
    const { appsToLoad, appsToMount, appsToUnmount } = getAppChanges();
    // start方法调用时是同步的，但是加载流程是异步饿
    if (started) {
        appChangeUnderway = true;
        // app装载
        return performAppChanges();
    } else {
        // 注册应用时 需要预先加载
        return loadApps();
    }
    async function loadApps() { // 预加载应用
        let apps = await Promise.all(appsToLoad.map(toLoadPromise)); // 就是获取到bootstrap,mount和unmount方法放到app上
        callAllEventListeners(eventArguments)
    }
    async function performAppChanges() { // 根据路径来装载应用
        // 先卸载不需要的应用 
        let unmountPromises = appsToUnmount.map(toUnmountPromise); // 需要去卸载的app
        await Promise.all(unmountPromises); // 等待先卸载完成后触发路由方法
        callCapturedEventListeners(eventArguments);
        // 去加载需要的应用

        // 这个应用可能需要加载 但是路径不匹配  加载app1 的时候，这个时候切换到了app2
        appsToLoad.map(async (app)=>{ // 将需要求加载的应用拿到 => 加载 => 启动 => 挂载
            app = await toLoadPromise(app); 
            app = await toBootstrapPromise(app);
            return toMountPromise(app);
        })
        appsToMount.map(async (app)=>{
            app = await toBootstrapPromise(app);
            return toMountPromise(app);
        });
        finishUpAndReturn(); // 完成后批量处理在队列中的任务
    }
    function finishUpAndReturn(){
        pendingPromises.forEach((promise) => promise.resolve(returnValue));
        appChangeUnderway = false;
        if(peopleWaitingOnAppChange.length > 0){
            const nextPendingPromises = peopleWaitingOnAppChange;
            peopleWaitingOnAppChange = [];
            reroute(nextPendingPromises)
        }
    }
    function callAllEventListeners(eventArguments) {
        pendingPromises.forEach((pendingPromise) => {
          callCapturedEventListeners(pendingPromise.eventArguments);
        });
        callCapturedEventListeners(eventArguments);
    }   
}

// 这个流程是用于初始化操作的，我们还需要 当路径切换时重新加载应用
// 重写路由相关的方法