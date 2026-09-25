module.exports=[591023,(a,b,c)=>{"use strict";var d=a.r(254799);function e(a,b){return b=h(a,b),function(a,b){if(void 0===(c="passthrough"!==b.algorithm?d.createHash(b.algorithm):new k).write&&(c.write=c.update,c.end=c.update),j(b,c).dispatch(a),c.update||c.end(""),c.digest)return c.digest("buffer"===b.encoding?void 0:b.encoding);var c,e=c.read();return"buffer"===b.encoding?e:e.toString(b.encoding)}(a,b)}(c=b.exports=e).sha1=function(a){return e(a)},c.keys=function(a){return e(a,{excludeValues:!0,algorithm:"sha1",encoding:"hex"})},c.MD5=function(a){return e(a,{algorithm:"md5",encoding:"hex"})},c.keysMD5=function(a){return e(a,{algorithm:"md5",encoding:"hex",excludeValues:!0})};var f=d.getHashes?d.getHashes().slice():["sha1","md5"];f.push("passthrough");var g=["buffer","hex","binary","base64"];function h(a,b){var c={};if(c.algorithm=(b=b||{}).algorithm||"sha1",c.encoding=b.encoding||"hex",c.excludeValues=!!b.excludeValues,c.algorithm=c.algorithm.toLowerCase(),c.encoding=c.encoding.toLowerCase(),c.ignoreUnknown=!0===b.ignoreUnknown,c.respectType=!1!==b.respectType,c.respectFunctionNames=!1!==b.respectFunctionNames,c.respectFunctionProperties=!1!==b.respectFunctionProperties,c.unorderedArrays=!0===b.unorderedArrays,c.unorderedSets=!1!==b.unorderedSets,c.unorderedObjects=!1!==b.unorderedObjects,c.replacer=b.replacer||void 0,c.excludeKeys=b.excludeKeys||void 0,void 0===a)throw Error("Object argument required.");for(var d=0;d<f.length;++d)f[d].toLowerCase()===c.algorithm.toLowerCase()&&(c.algorithm=f[d]);if(-1===f.indexOf(c.algorithm))throw Error('Algorithm "'+c.algorithm+'"  not supported. supported values: '+f.join(", "));if(-1===g.indexOf(c.encoding)&&"passthrough"!==c.algorithm)throw Error('Encoding "'+c.encoding+'"  not supported. supported values: '+g.join(", "));return c}function i(a){return"function"==typeof a&&null!=/^function\s+\w*\s*\(\s*\)\s*{\s+\[native code\]\s+}$/i.exec(Function.prototype.toString.call(a))}function j(a,b,c){c=c||[];var d=function(a){return b.update?b.update(a,"utf8"):b.write(a,"utf8")};return{dispatch:function(b){a.replacer&&(b=a.replacer(b));var c=typeof b;return null===b&&(c="null"),this["_"+c](b)},_object:function(b){var e=Object.prototype.toString.call(b),f=/\[object (.*)\]/i.exec(e);f=(f=f?f[1]:"unknown:["+e+"]").toLowerCase();var g=null;if((g=c.indexOf(b))>=0)return this.dispatch("[CIRCULAR:"+g+"]");if(c.push(b),"u">typeof Buffer&&Buffer.isBuffer&&Buffer.isBuffer(b))return d("buffer:"),d(b);if("object"!==f&&"function"!==f&&"asyncfunction"!==f)if(this["_"+f])this["_"+f](b);else if(a.ignoreUnknown)return d("["+f+"]");else throw Error('Unknown object type "'+f+'"');else{var h=Object.keys(b);a.unorderedObjects&&(h=h.sort()),!1===a.respectType||i(b)||h.splice(0,0,"prototype","__proto__","constructor"),a.excludeKeys&&(h=h.filter(function(b){return!a.excludeKeys(b)})),d("object:"+h.length+":");var j=this;return h.forEach(function(c){j.dispatch(c),d(":"),a.excludeValues||j.dispatch(b[c]),d(",")})}},_array:function(b,e){e=void 0!==e?e:!1!==a.unorderedArrays;var f=this;if(d("array:"+b.length+":"),!e||b.length<=1)return b.forEach(function(a){return f.dispatch(a)});var g=[],h=b.map(function(b){var d=new k,e=c.slice();return j(a,d,e).dispatch(b),g=g.concat(e.slice(c.length)),d.read().toString()});return c=c.concat(g),h.sort(),this._array(h,!1)},_date:function(a){return d("date:"+a.toJSON())},_symbol:function(a){return d("symbol:"+a.toString())},_error:function(a){return d("error:"+a.toString())},_boolean:function(a){return d("bool:"+a.toString())},_string:function(a){d("string:"+a.length+":"),d(a.toString())},_function:function(b){d("fn:"),i(b)?this.dispatch("[native]"):this.dispatch(b.toString()),!1!==a.respectFunctionNames&&this.dispatch("function-name:"+String(b.name)),a.respectFunctionProperties&&this._object(b)},_number:function(a){return d("number:"+a.toString())},_xml:function(a){return d("xml:"+a.toString())},_null:function(){return d("Null")},_undefined:function(){return d("Undefined")},_regexp:function(a){return d("regex:"+a.toString())},_uint8array:function(a){return d("uint8array:"),this.dispatch(Array.prototype.slice.call(a))},_uint8clampedarray:function(a){return d("uint8clampedarray:"),this.dispatch(Array.prototype.slice.call(a))},_int8array:function(a){return d("int8array:"),this.dispatch(Array.prototype.slice.call(a))},_uint16array:function(a){return d("uint16array:"),this.dispatch(Array.prototype.slice.call(a))},_int16array:function(a){return d("int16array:"),this.dispatch(Array.prototype.slice.call(a))},_uint32array:function(a){return d("uint32array:"),this.dispatch(Array.prototype.slice.call(a))},_int32array:function(a){return d("int32array:"),this.dispatch(Array.prototype.slice.call(a))},_float32array:function(a){return d("float32array:"),this.dispatch(Array.prototype.slice.call(a))},_float64array:function(a){return d("float64array:"),this.dispatch(Array.prototype.slice.call(a))},_arraybuffer:function(a){return d("arraybuffer:"),this.dispatch(new Uint8Array(a))},_url:function(a){return d("url:"+a.toString())},_map:function(b){d("map:");var c=Array.from(b);return this._array(c,!1!==a.unorderedSets)},_set:function(b){d("set:");var c=Array.from(b);return this._array(c,!1!==a.unorderedSets)},_file:function(a){return d("file:"),this.dispatch([a.name,a.size,a.type,a.lastModfied])},_blob:function(){if(a.ignoreUnknown)return d("[blob]");throw Error('Hashing Blob objects is currently not supported\n(see https://github.com/puleos/object-hash/issues/26)\nUse "options.replacer" or "options.ignoreUnknown"\n')},_domwindow:function(){return d("domwindow")},_bigint:function(a){return d("bigint:"+a.toString())},_process:function(){return d("process")},_timer:function(){return d("timer")},_pipe:function(){return d("pipe")},_tcp:function(){return d("tcp")},_udp:function(){return d("udp")},_tty:function(){return d("tty")},_statwatcher:function(){return d("statwatcher")},_securecontext:function(){return d("securecontext")},_connection:function(){return d("connection")},_zlib:function(){return d("zlib")},_context:function(){return d("context")},_nodescript:function(){return d("nodescript")},_httpparser:function(){return d("httpparser")},_dataview:function(){return d("dataview")},_signal:function(){return d("signal")},_fsevent:function(){return d("fsevent")},_tlswrap:function(){return d("tlswrap")}}}function k(){return{buf:"",write:function(a){this.buf+=a},end:function(a){this.buf+=a},read:function(){return this.buf}}}c.writeToStream=function(a,b,c){return void 0===c&&(c=b,b={}),j(b=h(a,b),c).dispatch(a)}},476025,a=>{"use strict";let b,c,d,e,f,g,h,i,j;var k,l,m,n,o,p,q,r,s,t,u,v,w,y,z,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,$,_,aa,ab,ac,ad,ae,af,ag,ah,ai,aj,ak,al,am,an,ao,ap,aq,ar,as,at,au,av,aw,ax,ay,az,aA,aB,aC,aD,aE,aF,aG,aH,aI,aJ,aK,aL,aM,aN,aO,aP,aQ,aR,aS,aT,aU,aV,aW,aX,aY,aZ,a$,a_,a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,ba,bb,bc,bd,be,bf,bg,bh,bi,bj,bk,bl,bm,bn,bo,bp,bq,br,bs,bt,bu,bv,bw,bx,by,bz,bA,bB,bC,bD,bE,bF,bG,bH,bI,bJ,bK,bL,bM,bN,bO,bP,bQ,bR,bS,bT,bU,bV,bW,bX,bY,bZ,b$,b_,b0,b1,b2,b3,b4,b5,b6,b7,b8,b9,ca,cb,cc,cd,ce,cf,cg,ch,ci,cj,ck,cl,cm,cn,co,cp,cq,cr,cs,ct=a.i(187924);a.i(847505);var cu=a.i(492182),cv=a.i(572131),cw=a.i(238246),cx=a.i(818419),cy=a.i(247394),cz=a.i(287302),cA=a.i(737317),cB=a.i(1369),cC=a.i(521521);(0,cC.init_react_import)(),(0,cC.init_react_import)(),(0,cC.init_react_import)(),(0,cC.init_react_import)(),(0,cC.init_react_import)(),(0,cC.init_react_import)();var cD=(a,b=a)=>({slot:({value:c,propName:d,field:e,isReadOnly:f})=>{let g=f?b:a;return a=>g((0,cC.__spreadProps)((0,cC.__spreadValues)({allow:(null==e?void 0:e.type)==="slot"?e.allow:[],disallow:(null==e?void 0:e.type)==="slot"?e.disallow:[]},a),{zone:d,content:c}))}});function cE(a,b,c){let d={};return Object.keys(a).forEach(e=>{d[e]=d=>{var{parentId:f}=d,g=(0,cC.__objRest)(d,["parentId"]);let h=g.propPath.replace(/\[\d+\]/g,"[*]"),i=(null==b?void 0:b[g.propPath])||(null==b?void 0:b[h])||c||!1,j=a[e];return null==j?void 0:j((0,cC.__spreadProps)((0,cC.__spreadValues)({},g),{field:g.field,isReadOnly:i,componentId:f}))}}),d}function cF(a,b,c,d=c,e,f){var g;let h,i;return g=cD(c,d),h=(0,cv.useMemo)(()=>cE(g,e,f),[g,e,f]),i=(0,cv.useMemo)(()=>(0,cB.mapFields)(b,h,a).props,[a,b,h]),(0,cv.useMemo)(()=>(0,cC.__spreadValues)((0,cC.__spreadValues)({},b.props),i),[b.props,i])}(0,cC.init_react_import)(),(0,cC.init_react_import)(),(0,cC.init_react_import)(),(0,cC.init_react_import)(),(0,cC.init_react_import)();var cG=(0,cA.get_class_name_factory_default)("RichTextEditor",cy.styles_module_default);function cH({content:a}){return(0,ct.jsx)("div",{className:cG(),children:(0,ct.jsx)("div",{className:"rich-text",dangerouslySetInnerHTML:{__html:a}})})}(0,cC.init_react_import)();var cI=(a,b,c)=>{if(!a)return null;if(0===b.length)return c(a);let[d,...e]=b;return Array.isArray(a)?a.map(a=>cI(a,b,c)):(0,cC.__spreadProps)((0,cC.__spreadValues)({},a),{[d]:cI(a[d],e,c)})},cJ=(0,cv.lazy)(()=>a.A(627201).then(a=>({default:a.RichTextRender})));function cK(a,b){let c=(a,b=[])=>{if(!a)return[];let d=[];for(let[e,f]of Object.entries(a)){let a=[...b,e];"richtext"===f.type&&d.push({path:a,field:f}),"array"===f.type&&"arrayFields"in f&&d.push(...c(f.arrayFields,a)),"object"===f.type&&"objectFields"in f&&d.push(...c(f.objectFields,a))}return d},d=(0,cv.useMemo)(()=>c(a),[a]);return(0,cv.useMemo)(()=>{if(!(null==d?void 0:d.length))return{};let a=(0,cC.__spreadValues)({},b);for(let{path:b,field:c}of d)a=cI(a,b,a=>(0,ct.jsx)(cv.Suspense,{fallback:(0,ct.jsx)(cH,{content:a}),children:(0,ct.jsx)(cJ,{content:a,field:c})},b.join(".")));return a},[d,b,a])}(0,cC.init_react_import)();var cL=a=>(0,ct.jsx)(cN,(0,cC.__spreadValues)({},a)),cM=({config:a,item:b,metadata:c})=>{let d=a.components[b.type],e=cF(a,b,b=>(0,ct.jsx)(cL,(0,cC.__spreadProps)((0,cC.__spreadValues)({},b),{config:a,metadata:c}))),f=cK(d.fields,e);return(0,ct.jsx)(d.render,(0,cC.__spreadProps)((0,cC.__spreadValues)((0,cC.__spreadValues)({},e),f),{puck:(0,cC.__spreadProps)((0,cC.__spreadValues)({},e.puck),{metadata:c||{}})}))},cN=(0,cv.forwardRef)(function({className:a,style:b,content:c,config:d,metadata:e,as:f},g){return(0,ct.jsx)(null!=f?f:"div",{className:a,style:b,ref:g,children:c.map(a=>d.components[a.type]?(0,ct.jsx)(cM,{config:d,item:a,metadata:e},a.props.id):null)})}),cO=a.i(335899),cP=a.i(564537),cQ=a.i(210324),cR=cC,cS=ct;let cT=(a,b)=>{let c=a instanceof Map?a:new Map(a.entries()),d=b instanceof Map?b:new Map(b.entries());if(c.size!==d.size)return!1;for(let[a,b]of c)if(!d.has(a)||!Object.is(b,d.get(a)))return!1;return!0};function cU(a){let b=cv.default.useRef(void 0);return c=>{let d=a(c);return!function(a,b){if(Object.is(a,b))return!0;if("object"!=typeof a||null===a||"object"!=typeof b||null===b||Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return!1;if(Symbol.iterator in a&&Symbol.iterator in b){if("entries"in a&&"entries"in b)return cT(a,b);let c=a[Symbol.iterator](),d=b[Symbol.iterator](),e=c.next(),f=d.next();for(;!e.done&&!f.done;){if(!Object.is(e.value,f.value))return!1;e=c.next(),f=d.next()}return!!e.done&&!!f.done}return cT({entries:()=>Object.entries(a)},{entries:()=>Object.entries(b)})}(b.current,d)?b.current=d:b.current}}var cV=a.i(312903),cW=a.i(920226),cX=a.i(862435);let cY=Symbol.for("preact-signals");function cZ(){if(c1>1)return void c1--;let a,b=!1,c=c0;for(c0=void 0;void 0!==c;){let a=c.S;if(a.v===c.v)for(let b=a.t;void 0!==b;b=b.x)b.i===c.i&&(b.i=a.i);c=c.o}for(;void 0!==d;){let c=d;for(d=void 0,c2++;void 0!==c;){let d=c.u;if(c.u=void 0,c.f&=-3,!(8&c.f)&&c9(c))try{c.c()}catch(c){b||(a=c,b=!0)}c=d}}if(c2=0,c1--,b)throw a}function c$(a){if(c1>0)return a();c4=++c3,c1++;try{return a()}finally{cZ()}}function c_(a){let d=b,e=c;b=void 0,c=void 0;try{return a()}finally{b=d,c=e}}let c0,c1=0,c2=0,c3=0,c4=0,c5=0;function c6(a){if(void 0===b)return;let c=a.n;return void 0===c||c.t!==b?(c={i:0,S:a,p:b.s,n:void 0,t:b,e:void 0,x:void 0,r:c},void 0!==b.s&&(b.s.n=c),b.s=c,a.n=c,32&b.f&&a.S(c),c):-1===c.i?(c.i=0,void 0!==c.n&&(c.n.p=c.p,void 0!==c.p&&(c.p.n=c.n),c.p=b.s,c.n=void 0,b.s.n=c,b.s=c),c):void 0}function c7(a,b){this.v=a,this.i=0,this.n=void 0,this.t=void 0,this.l=0,this.W=null==b?void 0:b.watched,this.Z=null==b?void 0:b.unwatched,this.name=null==b?void 0:b.name}function c8(a,b){return new c7(a,b)}function c9(a){for(let b=a.s;void 0!==b;b=b.n)if(b.S.i!==b.i||!b.S.h()||b.S.i!==b.i)return!0;return!1}function da(a){for(let b=a.s;void 0!==b;b=b.n){let c=b.S.n;if(void 0!==c&&(b.r=c),b.S.n=b,b.i=-1,void 0===b.n){a.s=b;break}}}function db(a){let b,c=a.s;for(;void 0!==c;){let a=c.p;-1===c.i?(c.S.U(c),void 0!==a&&(a.n=c.n),void 0!==c.n&&(c.n.p=a)):b=c,c.S.n=c.r,void 0!==c.r&&(c.r=void 0),c=a}a.s=b}function dc(a,b){c7.call(this,void 0,b),this.x=a,this.s=void 0,this.g=c5-1,this.f=4}function dd(a){let c=a.m;if(a.m=void 0,"function"==typeof c){c1++;let d=b;b=void 0;try{c()}catch(b){throw a.f&=-2,a.f|=8,de(a),b}finally{b=d,cZ()}}}function de(a){for(let b=a.s;void 0!==b;b=b.n)b.S.U(b);a.x=void 0,a.s=void 0,dd(a)}function df(a){if(b!==this)throw Error("Out-of-order effect");db(this),b=a,this.f&=-2,8&this.f&&de(this),cZ()}function dg(a,b){this.x=a,this.m=void 0,this.s=void 0,this.u=void 0,this.f=32,this.name=null==b?void 0:b.name,c&&c.push(this)}function dh(a,b){let c=new dg(a,b);try{c.c()}catch(a){throw c.d(),a}let d=c.d.bind(c);return d[Symbol.dispose]=d,d}c7.prototype.brand=cY,c7.prototype.h=function(){return!0},c7.prototype.S=function(a){let b=this.t;b!==a&&void 0===a.e&&(a.x=b,this.t=a,void 0!==b?b.e=a:c_(()=>{var a;null==(a=this.W)||a.call(this)}))},c7.prototype.U=function(a){if(void 0!==this.t){let b=a.e,c=a.x;void 0!==b&&(b.x=c,a.e=void 0),void 0!==c&&(c.e=b,a.x=void 0),a===this.t&&(this.t=c,void 0===c&&c_(()=>{var a;null==(a=this.Z)||a.call(this)}))}},c7.prototype.subscribe=function(a){return dh(()=>{let b=this.value;c_(()=>a(b))},{name:"sub"})},c7.prototype.valueOf=function(){return this.value},c7.prototype.toString=function(){return this.value+""},c7.prototype.toJSON=function(){return this.value},c7.prototype.peek=function(){return c_(()=>this.value)},Object.defineProperty(c7.prototype,"value",{get(){let a=c6(this);return void 0!==a&&(a.i=this.i),this.v},set(a){if(a!==this.v){if(c2>100)throw Error("Cycle detected");0!==c1&&0===c2&&this.l!==c4&&(this.l=c4,c0={S:this,v:this.v,i:this.i,o:c0}),this.v=a,this.i++,c5++,c1++;try{for(let a=this.t;void 0!==a;a=a.x)a.t.N()}finally{cZ()}}}}),dc.prototype=new c7,dc.prototype.h=function(){if(this.f&=-3,1&this.f)return!1;if(32==(36&this.f)||(this.f&=-5,this.g===c5))return!0;if(this.g=c5,this.f|=1,this.i>0&&!c9(this))return this.f&=-2,!0;let a=b;try{da(this),b=this;let a=this.x();(16&this.f||this.v!==a||0===this.i)&&(this.v=a,this.f&=-17,this.i++)}catch(a){this.v=a,this.f|=16,this.i++}return b=a,db(this),this.f&=-2,!0},dc.prototype.S=function(a){if(void 0===this.t){this.f|=36;for(let a=this.s;void 0!==a;a=a.n)a.S.S(a)}c7.prototype.S.call(this,a)},dc.prototype.U=function(a){if(void 0!==this.t&&(c7.prototype.U.call(this,a),void 0===this.t)){this.f&=-33;for(let a=this.s;void 0!==a;a=a.n)a.S.U(a)}},dc.prototype.N=function(){if(!(2&this.f)){this.f|=6;for(let a=this.t;void 0!==a;a=a.x)a.t.N()}},Object.defineProperty(dc.prototype,"value",{get(){if(1&this.f)throw Error("Cycle detected");let a=c6(this);if(this.h(),void 0!==a&&(a.i=this.i),16&this.f)throw this.v;return this.v}}),dg.prototype.c=function(){let a=this.S();try{if(8&this.f||void 0===this.x)return;let a=this.x();"function"==typeof a&&(this.m=a)}finally{a()}},dg.prototype.S=function(){if(1&this.f)throw Error("Cycle detected");this.f|=1,this.f&=-9,dd(this),da(this),c1++;let a=b;return b=this,df.bind(this,a)},dg.prototype.N=function(){2&this.f||(this.f|=2,this.u=d,d=this)},dg.prototype.d=function(){this.f|=8,1&this.f||de(this)},dg.prototype.dispose=function(){this.d()};var di=Object.create,dj=Object.defineProperty,dk=Object.defineProperties,dl=Object.getOwnPropertyDescriptor,dm=Object.getOwnPropertyDescriptors,dn=Object.getOwnPropertySymbols,dp=Object.prototype.hasOwnProperty,dq=Object.prototype.propertyIsEnumerable,dr=a=>{throw TypeError(a)},ds=(a,b,c)=>b in a?dj(a,b,{enumerable:!0,configurable:!0,writable:!0,value:c}):a[b]=c,dt=(a,b)=>dj(a,"name",{value:b,configurable:!0}),du=["class","method","getter","setter","accessor","field","value","get","set"],dv=a=>void 0!==a&&"function"!=typeof a?dr("Function expected"):a,dw=(a,b,c,d,e)=>({kind:du[a],name:b,metadata:d,addInitializer:a=>c._?dr("Already initialized"):e.push(dv(a||null))}),dx=(a,b)=>{let c,d;return ds(b,(c="metadata",(d=Symbol[c])?d:Symbol.for("Symbol."+c)),a[3])},dy=(a,b,c,d)=>{for(var e=0,f=a[b>>1],g=f&&f.length;e<g;e++)1&b?f[e].call(c):d=f[e].call(c,d);return d},dz=(a,b,c,d,e,f)=>{var g,h,i,j,k,l=7&b,m=!!(8&b),n=!!(16&b),o=l>3?a.length+1:l?m?1:2:0,p=du[l+5],q=l>3&&(a[o-1]=[]),r=a[o]||(a[o]=[]),s=l&&(n||m||(e=e.prototype),l<5&&(l>3||!n)&&dl(l<4?e:{get[c](){return dC(this,f)},set[c](x){return dE(this,f,x)}},c));l?n&&l<4&&dt(f,(l>2?"set ":l>1?"get ":"")+c):dt(e,c);for(var t=d.length-1;t>=0;t--)j=dw(l,c,i={},a[3],r),l&&(j.static=m,j.private=n,k=j.access={has:n?a=>dB(e,a):a=>c in a},3^l&&(k.get=n?a=>(1^l?dC:dF)(a,e,4^l?f:s.get):a=>a[c]),l>2&&(k.set=n?(a,b)=>dE(a,e,b,4^l?f:s.set):(a,b)=>a[c]=b)),h=(0,d[t])(l?l<4?n?f:s[p]:l>4?void 0:{get:s.get,set:s.set}:e,j),i._=1,4^l||void 0===h?dv(h)&&(l>4?q.unshift(h):l?n?f=h:s[p]=h:e=h):"object"!=typeof h||null===h?dr("Object expected"):(dv(g=h.get)&&(s.get=g),dv(g=h.set)&&(s.set=g),dv(g=h.init)&&q.unshift(g));return l||dx(a,e),s&&dj(e,c,s),n?4^l?f:s:e},dA=(a,b,c)=>b.has(a)||dr("Cannot "+c),dB=(a,b)=>Object(b)!==b?dr('Cannot use the "in" operator on this value'):a.has(b),dC=(a,b,c)=>(dA(a,b,"read from private field"),c?c.call(a):b.get(a)),dD=(a,b,c)=>b.has(a)?dr("Cannot add the same private member more than once"):b instanceof WeakSet?b.add(a):b.set(a,c),dE=(a,b,c,d)=>(dA(a,b,"write to private field"),d?d.call(a,c):b.set(a,c),c),dF=(a,b,c)=>(dA(a,b,"access private method"),c);function dG(a,b){if(b){let c;return new dc(()=>{let d=a();return d&&c&&b(c,d)?c:(c=d,d)},void 0)}return new dc(a,void 0)}function dH(a,b){if(Object.is(a,b))return!0;if(null===a||null===b)return!1;if("function"==typeof a&&"function"==typeof b)return a===b;if(a instanceof Set&&b instanceof Set){if(a.size!==b.size)return!1;for(let c of a)if(!b.has(c))return!1;return!0}if(Array.isArray(a))return!!Array.isArray(b)&&a.length===b.length&&!a.some((a,c)=>!dH(a,b[c]));if("object"==typeof a&&"object"==typeof b){let c=Object.keys(a),d=Object.keys(b);return c.length===d.length&&!c.some(c=>!dH(a[c],b[c]))}return!1}function dI({get:a},b){return{init:a=>c8(a),get(){return a.call(this).value},set(b){let c=a.call(this);c.peek()!==b&&(c.value=b)}}}function dJ(a,b){let c=new WeakMap;return function(){let b=c.get(this);return b||(b=dG(a.bind(this)),c.set(this,b)),b.value}}function dK(a=!0){return function(b,c){c.addInitializer(function(){let b="field"===c.kind||c.static?this:Object.getPrototypeOf(this),d=Object.getOwnPropertyDescriptor(b,c.name);d&&Object.defineProperty(b,c.name,dk(((a,b)=>{for(var c in b||(b={}))dp.call(b,c)&&ds(a,c,b[c]);if(dn)for(var c of dn(b))dq.call(b,c)&&ds(a,c,b[c]);return a})({},d),dm({enumerable:a})))})}}function dL(...a){let b=a.map(a=>dh(a));return()=>b.forEach(a=>a())}A=[dI],z=[dI],y=[dI],w=[dK()],v=[dK()],u=[dK()];var dM=class{constructor(a,b=Object.is){this.defaultValue=a,this.equals=b,dy(B,5,this),dD(this,G),dD(this,C,dy(B,8,this)),dy(B,11,this),dD(this,H,dy(B,12,this)),dy(B,15,this),dD(this,L,dy(B,16,this)),dy(B,19,this),this.reset=this.reset.bind(this),this.reset()}get current(){return dC(this,G,N)}get initial(){return dC(this,G,E)}get previous(){return dC(this,G,J)}set current(a){let b=c_(()=>dC(this,G,N));a&&b&&this.equals(b,a)||c$(()=>{dC(this,G,E)||dE(this,G,a,F),dE(this,G,b,K),dE(this,G,a,O)})}reset(a=this.defaultValue){c$(()=>{dE(this,G,void 0,K),dE(this,G,a,F),dE(this,G,a,O)})}};function dN(a){return c_(()=>{let b={};for(let c in a)b[c]=a[c];return b})}B=[,,,di(null)],C=new WeakMap,G=new WeakSet,H=new WeakMap,L=new WeakMap,E=(D=dz(B,20,"#initial",A,G,C)).get,F=D.set,J=(I=dz(B,20,"#previous",z,G,H)).get,K=I.set,N=(M=dz(B,20,"#current",y,G,L)).get,O=M.set,dz(B,2,"current",w,dM),dz(B,2,"initial",v,dM),dz(B,2,"previous",u,dM),dx(B,dM);var dO=class{constructor(){dD(this,P,new WeakMap)}get(a,b){var c;return a?null==(c=dC(this,P).get(a))?void 0:c.get(b):void 0}set(a,b,c){var d;if(a)return dC(this,P).has(a)||dC(this,P).set(a,new Map),null==(d=dC(this,P).get(a))?void 0:d.set(b,c)}clear(a){var b;return a?null==(b=dC(this,P).get(a))?void 0:b.clear():void 0}};P=new WeakMap;var dP=Object.create,dQ=Object.defineProperty,dR=Object.getOwnPropertyDescriptor,dS=Object.getOwnPropertySymbols,dT=Object.prototype.hasOwnProperty,dU=Object.prototype.propertyIsEnumerable,dV=(a,b)=>(b=Symbol[a])?b:Symbol.for("Symbol."+a),dW=a=>{throw TypeError(a)},dX=Math.pow,dY=(a,b,c)=>b in a?dQ(a,b,{enumerable:!0,configurable:!0,writable:!0,value:c}):a[b]=c,dZ=(a,b)=>dQ(a,"name",{value:b,configurable:!0}),d$=["class","method","getter","setter","accessor","field","value","get","set"],d_=a=>void 0!==a&&"function"!=typeof a?dW("Function expected"):a,d0=(a,b,c,d,e)=>({kind:d$[a],name:b,metadata:d,addInitializer:a=>c._?dW("Already initialized"):e.push(d_(a||null))}),d1=(a,b)=>dY(b,dV("metadata"),a[3]),d2=(a,b,c,d,e,f)=>{var g,h,i,j,k,l=7&b,m=!!(8&b),n=!!(16&b),o=l>3?a.length+1:l?m?1:2:0,p=d$[l+5],q=l>3&&(a[o-1]=[]),r=a[o]||(a[o]=[]),s=l&&(n||m||(e=e.prototype),l<5&&(l>3||!n)&&dR(l<4?e:{get[c](){return d5(this,f)},set[c](x){return d6(this,f,x)}},c));l?n&&l<4&&dZ(f,(l>2?"set ":l>1?"get ":"")+c):dZ(e,c);for(var t=d.length-1;t>=0;t--)j=d0(l,c,i={},a[3],r),l&&(j.static=m,j.private=n,k=j.access={has:n?a=>d4(e,a):a=>c in a},3^l&&(k.get=n?a=>(1^l?d5:d7)(a,e,4^l?f:s.get):a=>a[c]),l>2&&(k.set=n?(a,b)=>d6(a,e,b,4^l?f:s.set):(a,b)=>a[c]=b)),h=(0,d[t])(l?l<4?n?f:s[p]:l>4?void 0:{get:s.get,set:s.set}:e,j),i._=1,4^l||void 0===h?d_(h)&&(l>4?q.unshift(h):l?n?f=h:s[p]=h:e=h):"object"!=typeof h||null===h?dW("Object expected"):(d_(g=h.get)&&(s.get=g),d_(g=h.set)&&(s.set=g),d_(g=h.init)&&q.unshift(g));return l||d1(a,e),s&&dQ(e,c,s),n?4^l?f:s:e},d3=(a,b,c)=>b.has(a)||dW("Cannot "+c),d4=(a,b)=>Object(b)!==b?dW('Cannot use the "in" operator on this value'):a.has(b),d5=(a,b,c)=>(d3(a,b,"read from private field"),c?c.call(a):b.get(a)),d6=(a,b,c,d)=>(d3(a,b,"write to private field"),d?d.call(a,c):b.set(a,c),c),d7=(a,b,c)=>(d3(a,b,"access private method"),c),d8=class a{constructor(a,b){this.x=a,this.y=b}static delta(b,c){return new a(b.x-c.x,b.y-c.y)}static distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}static equals(a,b){return a.x===b.x&&a.y===b.y}static from({x:b,y:c}){return new a(b,c)}},d9=class a{constructor(a,b,c,d){this.left=a,this.top=b,this.width=c,this.height=d,this.scale={x:1,y:1}}get inverseScale(){return{x:1/this.scale.x,y:1/this.scale.y}}translate(b,c){let{top:d,left:e,width:f,height:g,scale:h}=this,i=new a(e+b,d+c,f,g);return i.scale=((a,b)=>{for(var c in b||(b={}))dT.call(b,c)&&dY(a,c,b[c]);if(dS)for(var c of dS(b))dU.call(b,c)&&dY(a,c,b[c]);return a})({},h),i}get boundingRectangle(){let{width:a,height:b,left:c,top:d,right:e,bottom:f}=this;return{width:a,height:b,left:c,top:d,right:e,bottom:f}}get center(){let{left:a,top:b,right:c,bottom:d}=this;return new d8((a+c)/2,(b+d)/2)}get area(){let{width:a,height:b}=this;return a*b}equals(b){if(!(b instanceof a))return!1;let{left:c,top:d,width:e,height:f}=this;return c===b.left&&d===b.top&&e===b.width&&f===b.height}containsPoint(a){let{top:b,left:c,bottom:d,right:e}=this;return b<=a.y&&a.y<=d&&c<=a.x&&a.x<=e}intersectionArea(b){var c,d;let e,f,g,h;return b instanceof a?(c=this,e=Math.max((d=b).top,c.top),f=Math.max(d.left,c.left),g=Math.min(d.left+d.width,c.left+c.width),h=Math.min(d.top+d.height,c.top+c.height),f<g&&e<h?(g-f)*(h-e):0):0}intersectionRatio(a){let{area:b}=this,c=this.intersectionArea(a);return c/(a.area+b-c)}get bottom(){let{top:a,height:b}=this;return a+b}get right(){let{left:a,width:b}=this;return a+b}get aspectRatio(){let{width:a,height:b}=this;return a/b}get corners(){return[{x:this.left,y:this.top},{x:this.right,y:this.top},{x:this.left,y:this.bottom},{x:this.right,y:this.bottom}]}static from({top:b,left:c,width:d,height:e}){return new a(c,b,d,e)}static delta(a,b,c={x:"center",y:"center"}){let d=(a,b)=>{let d=c[b],e="x"===b?a.left:a.top,f="x"===b?a.width:a.height;return"start"==d?e:"end"==d?e+f:e+f/2};return d8.delta({x:d(a,"x"),y:d(a,"y")},{x:d(b,"x"),y:d(b,"y")})}static intersectionRatio(b,c){return a.from(b).intersectionRatio(a.from(c))}},ea=class extends(S=dM,R=[dJ],Q=[dJ],S){constructor(a){super(d8.from(a),(a,b)=>d8.equals(a,b)),((a,b)=>{for(var c=0,d=a[2],e=d&&d.length;c<e;c++)d[c].call(b)})(U,this),((a,b)=>b.has(a)?dW("Cannot add the same private member more than once"):b instanceof WeakSet?b.add(a):b.set(a,0))(this,T),this.velocity={x:0,y:0}}get delta(){return d8.delta(this.current,this.initial)}get direction(){let{current:a,previous:b}=this;if(!b)return null;let c={x:a.x-b.x,y:a.y-b.y};return c.x||c.y?Math.abs(c.x)>Math.abs(c.y)?c.x>0?"right":"left":c.y>0?"down":"up":null}get current(){return super.current}set current(a){let{current:b}=this,c=d8.from(a),d={x:c.x-b.x,y:c.y-b.y},e=Date.now(),f=e-d5(this,T),g=a=>Math.round(a/f*100);c$(()=>{d6(this,T,e),this.velocity={x:g(d.x),y:g(d.y)},super.current=c})}reset(a=this.defaultValue){super.reset(d8.from(a)),this.velocity={x:0,y:0}}};function eb({x:a,y:b},c){let d=Math.abs(a),e=Math.abs(b);return"number"==typeof c?Math.sqrt(dX(d,2)+dX(e,2))>c:"x"in c&&"y"in c?d>c.x&&e>c.y:"x"in c?d>c.x:"y"in c&&e>c.y}U=[,,,dP(null!=(k=null==S?void 0:S[dV("metadata")])?k:null)],T=new WeakMap,d2(U,2,"delta",R,ea),d2(U,2,"direction",Q,ea),d1(U,ea);var ec=((l=ec||{}).Horizontal="x",l.Vertical="y",l),ed=Object.values(ec),ee=Object.create,ef=Object.defineProperty,eg=Object.defineProperties,eh=Object.getOwnPropertyDescriptor,ei=Object.getOwnPropertyDescriptors,ej=Object.getOwnPropertySymbols,ek=Object.prototype.hasOwnProperty,el=Object.prototype.propertyIsEnumerable,em=(a,b)=>(b=Symbol[a])?b:Symbol.for("Symbol."+a),en=a=>{throw TypeError(a)},eo=(a,b,c)=>b in a?ef(a,b,{enumerable:!0,configurable:!0,writable:!0,value:c}):a[b]=c,ep=(a,b)=>{for(var c in b||(b={}))ek.call(b,c)&&eo(a,c,b[c]);if(ej)for(var c of ej(b))el.call(b,c)&&eo(a,c,b[c]);return a},eq=(a,b)=>eg(a,ei(b)),er=(a,b)=>ef(a,"name",{value:b,configurable:!0}),es=(a,b)=>{var c={};for(var d in a)ek.call(a,d)&&0>b.indexOf(d)&&(c[d]=a[d]);if(null!=a&&ej)for(var d of ej(a))0>b.indexOf(d)&&el.call(a,d)&&(c[d]=a[d]);return c},et=a=>{var b;return[,,,ee(null!=(b=null==a?void 0:a[em("metadata")])?b:null)]},eu=["class","method","getter","setter","accessor","field","value","get","set"],ev=a=>void 0!==a&&"function"!=typeof a?en("Function expected"):a,ew=(a,b,c,d,e)=>({kind:eu[a],name:b,metadata:d,addInitializer:a=>c._?en("Already initialized"):e.push(ev(a||null))}),ex=(a,b)=>eo(b,em("metadata"),a[3]),ey=(a,b,c,d)=>{for(var e=0,f=a[b>>1],g=f&&f.length;e<g;e++)1&b?f[e].call(c):d=f[e].call(c,d);return d},ez=(a,b,c,d,e,f)=>{var g,h,i,j,k,l=7&b,m=!!(8&b),n=!!(16&b),o=l>3?a.length+1:l?m?1:2:0,p=eu[l+5],q=l>3&&(a[o-1]=[]),r=a[o]||(a[o]=[]),s=l&&(n||m||(e=e.prototype),l<5&&(l>3||!n)&&eh(l<4?e:{get[c](){return eC(this,f)},set[c](x){return eE(this,f,x)}},c));l?n&&l<4&&er(f,(l>2?"set ":l>1?"get ":"")+c):er(e,c);for(var t=d.length-1;t>=0;t--)j=ew(l,c,i={},a[3],r),l&&(j.static=m,j.private=n,k=j.access={has:n?a=>eB(e,a):a=>c in a},3^l&&(k.get=n?a=>(1^l?eC:eF)(a,e,4^l?f:s.get):a=>a[c]),l>2&&(k.set=n?(a,b)=>eE(a,e,b,4^l?f:s.set):(a,b)=>a[c]=b)),h=(0,d[t])(l?l<4?n?f:s[p]:l>4?void 0:{get:s.get,set:s.set}:e,j),i._=1,4^l||void 0===h?ev(h)&&(l>4?q.unshift(h):l?n?f=h:s[p]=h:e=h):"object"!=typeof h||null===h?en("Object expected"):(ev(g=h.get)&&(s.get=g),ev(g=h.set)&&(s.set=g),ev(g=h.init)&&q.unshift(g));return l||ex(a,e),s&&ef(e,c,s),n?4^l?f:s:e},eA=(a,b,c)=>b.has(a)||en("Cannot "+c),eB=(a,b)=>Object(b)!==b?en('Cannot use the "in" operator on this value'):a.has(b),eC=(a,b,c)=>(eA(a,b,"read from private field"),c?c.call(a):b.get(a)),eD=(a,b,c)=>b.has(a)?en("Cannot add the same private member more than once"):b instanceof WeakSet?b.add(a):b.set(a,c),eE=(a,b,c,d)=>(eA(a,b,"write to private field"),d?d.call(a,c):b.set(a,c),c),eF=(a,b,c)=>(eA(a,b,"access private method"),c);function eG(a,b){return{plugin:a,options:b}}function eH(a){return b=>eG(a,b)}function eI(a){return"function"==typeof a?{plugin:a,options:void 0}:a}V=[dI];var eJ=class{constructor(a,b){this.manager=a,this.options=b,eD(this,X,ey(W,8,this,!1)),ey(W,11,this),eD(this,Y,new Set)}enable(){this.disabled=!1}disable(){this.disabled=!0}isDisabled(){return c_(()=>this.disabled)}configure(a){this.options=a}registerEffect(a){let b=dh(a.bind(this));return eC(this,Y).add(b),b}destroy(){eC(this,Y).forEach(a=>a())}static configure(a){return eG(this,a)}};W=et(null),X=new WeakMap,Y=new WeakMap,ez(W,4,"disabled",V,eJ,X),ex(W,eJ);var eK=class extends eJ{},eL=class{constructor(a){this.manager=a,this.instances=new Map,eD(this,Z,[])}get values(){return Array.from(this.instances.values())}set values(a){let b=a.map(eI).reduce((a,b)=>{let c=a.find(({plugin:a})=>a===b.plugin);return c?(c.options=b.options,a):[...a,b]},[]),c=b.map(({plugin:a})=>a);for(let a of eC(this,Z))if(!c.includes(a)){if(a.prototype instanceof eK)continue;this.unregister(a)}for(let{plugin:a,options:c}of b)this.register(a,c);eE(this,Z,c)}get(a){return this.instances.get(a)}register(a,b){let c=this.instances.get(a);if(c)return c.options!==b&&(c.options=b),c;let d=new a(this.manager,b);return this.instances.set(a,d),d}unregister(a){let b=this.instances.get(a);b&&(b.destroy(),this.instances.delete(a))}destroy(){for(let a of this.instances.values())a.destroy();this.instances.clear()}};function eM(a,b){return a.priority===b.priority?a.type===b.type?b.value-a.value:b.type-a.type:b.priority-a.priority}Z=new WeakMap;var eN=[],eO=class extends eJ{constructor(a){super(a),eD(this,$),eD(this,_),this.computeCollisions=this.computeCollisions.bind(this),eE(this,_,c8(eN)),this.destroy=dL(()=>{let a=this.computeCollisions(),b=c_(()=>this.manager.dragOperation.position.current);if(a!==eN){let a=eC(this,$);if(eE(this,$,b),a&&b.x==a.x&&b.y==a.y)return}else eE(this,$,void 0);eC(this,_).value=a},()=>{let{dragOperation:a}=this.manager;a.status.initialized&&this.forceUpdate()})}forceUpdate(a=!0){c_(()=>{a?eC(this,_).value=this.computeCollisions():eE(this,$,void 0)})}computeCollisions(a,b){let{registry:c,dragOperation:d}=this.manager,{source:e,shape:f,status:g}=d;if(!g.initialized||!f)return eN;let h=[],i=[];for(let f of null!=a?a:c.droppables){if(f.disabled||e&&!f.accepts(e))continue;let a=null!=b?b:f.collisionDetector;if(!a)continue;i.push(f),f.shape;let c=c_(()=>a({droppable:f,dragOperation:d}));c&&(null!=f.collisionPriority&&(c.priority=f.collisionPriority),h.push(c))}return 0===i.length?eN:(h.sort(eM),h)}get collisions(){return eC(this,_).value}};$=new WeakMap,_=new WeakMap,ac=[dI],ab=[dI],aa=[dI];var eP=class a{constructor(a,b){eD(this,ag,ey(af,8,this)),ey(af,11,this),eD(this,ah),eD(this,ai,ey(af,12,this)),ey(af,15,this),eD(this,aj,ey(af,16,this)),ey(af,19,this);const{effects:c,id:d,data:e={},disabled:f=!1,register:g=!0}=a;let h=d;eE(this,ah,c8(d)),this.manager=b,this.data=e,this.disabled=f,this.effects=()=>{var a;return[()=>{let{id:a,manager:b}=this;if(a!==h)return h=a,null==b||b.registry.register(this),()=>null==b?void 0:b.registry.unregister(this)},...null!=(a=null==c?void 0:c())?a:[]]},this.register=this.register.bind(this),this.unregister=this.unregister.bind(this),this.destroy=this.destroy.bind(this),b&&g&&queueMicrotask(this.register)}get id(){var b,c;let d=eC(this,ah).value;return null!=(c=null==(b=a.pendingIdChanges)?void 0:b.get(this))?c:d}set id(b){var c,d;b!==(null!=(d=null==(c=a.pendingIdChanges)?void 0:c.get(this))?d:eC(this,ah).peek())&&(a.pendingIdChanges||(a.pendingIdChanges=new Map,queueMicrotask(()=>eF(a,ad,ae).call(a))),a.pendingIdChanges.set(this,b))}register(){var a;return null==(a=this.manager)?void 0:a.registry.register(this)}unregister(){var a;null==(a=this.manager)||a.registry.unregister(this)}destroy(){var a;null==(a=this.manager)||a.registry.unregister(this)}};af=et(null),ad=new WeakSet,ae=function(){let a=eP.pendingIdChanges;eP.pendingIdChanges=null,a&&c$(()=>{for(let[b,c]of a)eC(b,ah).value=c})},ag=new WeakMap,ah=new WeakMap,ai=new WeakMap,aj=new WeakMap,ez(af,4,"manager",ac,eP,ag),ez(af,4,"data",ab,eP,ai),ez(af,4,"disabled",aa,eP,aj),eD(eP,ad),ex(af,eP),eP.pendingIdChanges=null;var eQ=eP,eR=class{constructor(){this.map=c8(new Map),this.cleanupFunctions=new WeakMap,this.register=(a,b)=>{let c=this.map.peek(),d=c.get(a),e=()=>this.unregister(a,b);if(d===b)return e;if(d&&d.id===a){let a=this.cleanupFunctions.get(d);null==a||a(),this.cleanupFunctions.delete(d)}let f=new Map(c);for(let[d,e]of c)if(e===b&&d!==a){f.delete(d);break}f.set(a,b),this.map.value=f;let g=dL(...b.effects());return this.cleanupFunctions.set(b,g),e},this.unregister=(a,b)=>{let c=this.map.peek();if(c.get(a)!==b)return;let d=this.cleanupFunctions.get(b);null==d||d(),this.cleanupFunctions.delete(b);let e=new Map(c);e.delete(a),this.map.value=e}}[Symbol.iterator](){return this.map.peek().values()}get value(){return this.map.value.values()}has(a){return this.map.value.has(a)}get(a){return this.map.value.get(a)}destroy(){for(let a of this){let b=this.cleanupFunctions.get(a);null==b||b(),a.destroy()}this.map.value=new Map}},eS=class extends(aq=eQ,ap=[dI],ao=[dI],an=[dI],am=[dJ],al=[dJ],ak=[dJ],aq){constructor(a,b){var{modifiers:c,type:d,sensors:e,plugins:f,effects:g}=a,h=es(a,["modifiers","type","sensors","plugins","effects"]);super(eq(ep({},h),{effects:()=>{var a;return[...null!=(a=null==g?void 0:g())?a:[],()=>{let{manager:a,plugins:b}=this;if(a&&b)for(let c of b){let{plugin:b}=eI(c);a.registry.plugins.register(b)}}]}}),b),ey(ar,5,this),eD(this,as,ey(ar,8,this)),ey(ar,11,this),eD(this,at,ey(ar,12,this)),ey(ar,15,this),eD(this,au,ey(ar,16,this,this.isDragSource?"dragging":"idle")),ey(ar,19,this),this.type=d,this.sensors=e,this.modifiers=c,this.alignment=h.alignment,this.plugins=f}pluginConfig(a){if(this.plugins)for(let b of this.plugins){let c=eI(b);if(c.plugin===a)return c.options}}get isDropping(){return"dropping"===this.status&&this.isDragSource}get isDragging(){return"dragging"===this.status&&this.isDragSource}get isDragSource(){var a,b;return(null==(b=null==(a=this.manager)?void 0:a.dragOperation.source)?void 0:b.id)===this.id}};ar=et(aq),as=new WeakMap,at=new WeakMap,au=new WeakMap,ez(ar,4,"type",ap,eS,as),ez(ar,4,"modifiers",ao,eS,at),ez(ar,4,"status",an,eS,au),ez(ar,2,"isDropping",am,eS),ez(ar,2,"isDragging",al,eS),ez(ar,2,"isDragSource",ak,eS),ex(ar,eS);var eT=class extends(aB=eQ,aA=[dI],az=[dI],ay=[dI],ax=[dI],aw=[dI],av=[dJ],aB){constructor(a,b){var{accept:c,collisionDetector:d,collisionPriority:e,type:f}=a;super(es(a,["accept","collisionDetector","collisionPriority","type"]),b),ey(aC,5,this),eD(this,aD,ey(aC,8,this)),ey(aC,11,this),eD(this,aE,ey(aC,12,this)),ey(aC,15,this),eD(this,aF,ey(aC,16,this)),ey(aC,19,this),eD(this,aG,ey(aC,20,this)),ey(aC,23,this),eD(this,aH,ey(aC,24,this)),ey(aC,27,this),this.accept=c,this.collisionDetector=d,this.collisionPriority=e,this.type=f}accepts(a){let{accept:b}=this;return!b||("function"==typeof b?b(a):!!a.type&&(Array.isArray(b)?b.includes(a.type):a.type===b))}get isDropTarget(){var a,b;return(null==(b=null==(a=this.manager)?void 0:a.dragOperation.target)?void 0:b.id)===this.id}};aC=et(aB),aD=new WeakMap,aE=new WeakMap,aF=new WeakMap,aG=new WeakMap,aH=new WeakMap,ez(aC,4,"accept",aA,eT,aD),ez(aC,4,"type",az,eT,aE),ez(aC,4,"collisionDetector",ay,eT,aF),ez(aC,4,"collisionPriority",ax,eT,aG),ez(aC,4,"shape",aw,eT,aH),ez(aC,2,"isDropTarget",av,eT),ex(aC,eT);var eU=class{constructor(){this.registry=new Map}addEventListener(a,b){let{registry:c}=this,d=new Set(c.get(a));return d.add(b),c.set(a,d),()=>this.removeEventListener(a,b)}removeEventListener(a,b){let{registry:c}=this,d=new Set(c.get(a));d.delete(b),c.set(a,d)}dispatch(a,...b){let{registry:c}=this,d=c.get(a);if(d)for(let a of d)a(...b)}},eV=class extends eU{constructor(a){super(),this.manager=a}dispatch(a,b){let c=[b,this.manager];super.dispatch(a,...c)}};function eW(a,b=!0){let c=!1;return eq(ep({},a),{cancelable:b,get defaultPrevented(){return c},preventDefault(){b&&(c=!0)}})}var eX=class extends eK{constructor(a){super(a);let b=[];this.destroy=dL(()=>{let{dragOperation:c,collisionObserver:d}=a;c.status.initializing&&(b=[],d.enable())},()=>{let c,{collisionObserver:d,monitor:e}=a,{collisions:f}=d;if(d.isDisabled()||eQ.pendingIdChanges)return;let g=eW({collisions:f});if(e.dispatch("collision",g),g.defaultPrevented||(c=b,f.map(({id:a})=>a).join("")===c.map(({id:a})=>a).join("")))return;b=f;let[h]=f;c_(()=>{var b;(null==h?void 0:h.id)!==(null==(b=a.dragOperation.target)?void 0:b.id)&&(d.disable(),a.actions.setDropTarget(null==h?void 0:h.id).then(()=>{d.enable()}))})})}},eY=((m=eY||{})[m.Lowest=0]="Lowest",m[m.Low=1]="Low",m[m.Normal=2]="Normal",m[m.High=3]="High",m[m.Highest=4]="Highest",m),eZ=((n=eZ||{})[n.Collision=0]="Collision",n[n.ShapeIntersection=1]="ShapeIntersection",n[n.PointerIntersection=2]="PointerIntersection",n);aO=[dI],aN=[dJ],aM=[dJ],aL=[dJ],aK=[dJ],aJ=[dJ],aI=[dJ];var e$=class{constructor(){ey(aP,5,this),eD(this,aQ,ey(aP,8,this,"idle")),ey(aP,11,this)}get current(){return this.value}get idle(){return"idle"===this.value}get initializing(){return"initializing"===this.value}get initialized(){let{value:a}=this;return"idle"!==a&&"initialization-pending"!==a}get dragging(){return"dragging"===this.value}get dropped(){return"dropped"===this.value}set(a){this.value=a}};aP=et(null),aQ=new WeakMap,ez(aP,4,"value",aO,e$,aQ),ez(aP,2,"current",aN,e$),ez(aP,2,"idle",aM,e$),ez(aP,2,"initializing",aL,e$),ez(aP,2,"initialized",aK,e$),ez(aP,2,"dragging",aJ,e$),ez(aP,2,"dropped",aI,e$),ex(aP,e$);var e_=class{constructor(a){this.manager=a}setDragSource(a){let{dragOperation:b}=this.manager;b.sourceIdentifier="string"==typeof a||"number"==typeof a?a:a.id}setDropTarget(a){return c_(()=>{let{dragOperation:b}=this.manager,c=null!=a?a:null;if(b.targetIdentifier===c)return Promise.resolve(!1);b.targetIdentifier=c;let d=eW({operation:b.snapshot()});return b.status.dragging&&this.manager.monitor.dispatch("dragover",d),this.manager.renderer.rendering.then(()=>d.defaultPrevented)})}start(a){return c_(()=>{let{dragOperation:b}=this.manager;if(null!=a.source&&this.setDragSource(a.source),!b.source)throw Error("Cannot start a drag operation without a drag source");if(!b.status.idle)throw Error("Cannot start a drag operation while another is active");let c=new AbortController,{event:d,coordinates:e}=a;c$(()=>{b.status.set("initialization-pending"),b.shape=null,b.canceled=!1,b.activatorEvent=null!=d?d:null,b.position.reset(e)});let f=eW({operation:b.snapshot()});return(this.manager.monitor.dispatch("beforedragstart",f),f.defaultPrevented)?(b.reset(),c.abort()):(b.status.set("initializing"),b.controller=c,this.manager.renderer.rendering.then(()=>{if(c.signal.aborted)return;let{status:a}=b;"initializing"===a.current&&c$(()=>{b.status.set("dragging"),this.manager.monitor.dispatch("dragstart",{nativeEvent:d,operation:b.snapshot(),cancelable:!1})})})),c})}move(a){return c_(()=>{var b,c;let{dragOperation:d}=this.manager,{status:e,controller:f}=d;if(!e.dragging||!f||f.signal.aborted)return;let g=eW({nativeEvent:a.event,operation:d.snapshot(),by:a.by,to:a.to},null==(b=a.cancelable)||b);(null==(c=a.propagate)||c)&&this.manager.monitor.dispatch("dragmove",g),queueMicrotask(()=>{var b,c,e,f,h;if(g.defaultPrevented)return;let i=null!=(h=a.to)?h:{x:d.position.current.x+(null!=(c=null==(b=a.by)?void 0:b.x)?c:0),y:d.position.current.y+(null!=(f=null==(e=a.by)?void 0:e.y)?f:0)};d.position.current=i})})}stop(a={}){return c_(()=>{var b,c;let d,{dragOperation:e}=this.manager,{controller:f}=e;if(!f||f.signal.aborted)return;f.abort();let g=()=>{this.manager.renderer.rendering.then(()=>{e.status.set("dropped");let a=c_(()=>{var a;return(null==(a=e.source)?void 0:a.status)==="dropping"}),b=()=>{e.controller===f&&(e.controller=void 0),e.reset()};if(a){let{source:a}=e,c=dh(()=>{(null==a?void 0:a.status)==="idle"&&(c(),b())})}else this.manager.renderer.rendering.then(b)})};e.canceled=null!=(b=a.canceled)&&b,this.manager.monitor.dispatch("dragend",{nativeEvent:a.event,operation:e.snapshot(),canceled:null!=(c=a.canceled)&&c,suspend:()=>{let a={resume:()=>{},abort:()=>{}};return d=new Promise((b,c)=>{a.resume=b,a.abort=c}),a}}),d?d.then(g).catch(()=>e.reset()):g()})}},e0=class extends eJ{constructor(a,b){super(a,b),this.manager=a,this.options=b}},e1=class extends AbortController{constructor(a,b){for(const c of(super(),this.constraints=a,this.onActivate=b,this.activated=!1,null!=a?a:[]))c.controller=this}onEvent(a){var b;if(!this.activated)if(null==(b=this.constraints)?void 0:b.length)for(let b of this.constraints)b.onEvent(a);else this.activate(a)}activate(a){this.activated||(this.activated=!0,this.onActivate(a))}abort(a){this.activated=!1,super.abort(a)}},e2=class{constructor(a){this.options=a,eD(this,aR)}set controller(a){eE(this,aR,a),a.signal.addEventListener("abort",()=>this.abort())}activate(a){var b;null==(b=eC(this,aR))||b.activate(a)}};aR=new WeakMap;var e3=class extends eJ{constructor(a,b){super(a,b),this.manager=a,this.options=b}apply(a){return a.transform}},e4=class{constructor(a){this.draggables=new eR,this.droppables=new eR,this.plugins=new eL(a),this.sensors=new eL(a),this.modifiers=new eL(a)}register(a,b){if(a instanceof eS)return this.draggables.register(a.id,a);if(a instanceof eT)return this.droppables.register(a.id,a);if(a.prototype instanceof e3)return this.modifiers.register(a,b);if(a.prototype instanceof e0)return this.sensors.register(a,b);if(a.prototype instanceof eJ)return this.plugins.register(a,b);throw Error("Invalid instance type")}unregister(a){if(a instanceof eQ)return a instanceof eS?this.draggables.unregister(a.id,a):a instanceof eT?this.droppables.unregister(a.id,a):()=>{};if(a.prototype instanceof e3)return this.modifiers.unregister(a);if(a.prototype instanceof e0)return this.sensors.unregister(a);if(a.prototype instanceof eJ)return this.plugins.unregister(a);throw Error("Invalid instance type")}destroy(){this.draggables.destroy(),this.droppables.destroy(),this.plugins.destroy(),this.sensors.destroy(),this.modifiers.destroy()}};a$=[dJ],aZ=[dI],aY=[dI],aX=[dI],aW=[dI],aV=[dI],aU=[dJ],aT=[dJ],aS=[dJ];var e5=class{constructor(a){ey(a2,5,this),eD(this,a_),eD(this,a0),eD(this,a1,new dM(void 0,(a,b)=>a&&b?a.equals(b):a===b)),this.status=new e$,eD(this,a3,ey(a2,8,this,!1)),ey(a2,11,this),eD(this,a4,ey(a2,12,this,null)),ey(a2,15,this),eD(this,a5,ey(a2,16,this,null)),ey(a2,19,this),eD(this,a6,ey(a2,20,this,null)),ey(a2,23,this),eD(this,a7,ey(a2,24,this,[])),ey(a2,27,this),this.position=new ea({x:0,y:0}),eD(this,a8,{x:0,y:0}),eE(this,a_,a)}get shape(){let{current:a,initial:b,previous:c}=eC(this,a1);return a&&b?{current:a,initial:b,previous:c}:null}set shape(a){a?eC(this,a1).current=a:eC(this,a1).reset()}get source(){var a;let b=this.sourceIdentifier;if(null==b)return null;let c=eC(this,a_).registry.draggables.get(b);return c&&eE(this,a0,c),null!=(a=null!=c?c:eC(this,a0))?a:null}get target(){var a;let b=this.targetIdentifier;return null!=b&&null!=(a=eC(this,a_).registry.droppables.get(b))?a:null}get transform(){let{x:a,y:b}=this.position.delta,c={x:a,y:b};for(let a of this.modifiers)c=a.apply(eq(ep({},this.snapshot()),{transform:c}));return eE(this,a8,c),c}snapshot(){return c_(()=>({source:this.source,target:this.target,activatorEvent:this.activatorEvent,transform:eC(this,a8),shape:this.shape?dN(this.shape):null,position:dN(this.position),status:dN(this.status),canceled:this.canceled}))}reset(){c$(()=>{this.status.set("idle"),this.sourceIdentifier=null,this.targetIdentifier=null,eC(this,a1).reset(),this.position.reset({x:0,y:0}),eE(this,a8,{x:0,y:0}),this.modifiers=[]})}};a2=et(null),a_=new WeakMap,a0=new WeakMap,a1=new WeakMap,a3=new WeakMap,a4=new WeakMap,a5=new WeakMap,a6=new WeakMap,a7=new WeakMap,a8=new WeakMap,ez(a2,2,"shape",a$,e5),ez(a2,4,"canceled",aZ,e5,a3),ez(a2,4,"activatorEvent",aY,e5,a4),ez(a2,4,"sourceIdentifier",aX,e5,a5),ez(a2,4,"targetIdentifier",aW,e5,a6),ez(a2,4,"modifiers",aV,e5,a7),ez(a2,2,"source",aU,e5),ez(a2,2,"target",aT,e5),ez(a2,2,"transform",aS,e5),ex(a2,e5);var e6={get rendering(){return Promise.resolve()}};function e7(a,b){return"function"==typeof a?a(b):null!=a?a:b}var e8=class{constructor(a){var b;this.destroy=()=>{this.dragOperation.status.idle||this.actions.stop({canceled:!0}),this.dragOperation.modifiers.forEach(a=>a.destroy()),this.registry.destroy(),this.collisionObserver.destroy()};const c=null!=a?a:{},d=e7(c.plugins,[]),e=e7(c.sensors,[]),f=e7(c.modifiers,[]),g=null!=(b=c.renderer)?b:e6,h=new eV(this),i=new e4(this);this.registry=i,this.monitor=h,this.renderer=g,this.actions=new e_(this),this.dragOperation=new e5(this),this.collisionObserver=new eO(this),this.plugins=[eX,...d],this.modifiers=f,this.sensors=e;const{destroy:j}=this,k=dL(()=>{var a,b,c;let d=c_(()=>this.dragOperation.modifiers),e=this.modifiers;for(let a of d)e.includes(a)||a.destroy();this.dragOperation.modifiers=null!=(c=null==(b=null==(a=this.dragOperation.source)?void 0:a.modifiers)?void 0:b.map(a=>{let{plugin:b,options:c}=eI(a);return new b(this,c)}))?c:e});this.destroy=()=>{k(),j()}}get plugins(){return this.registry.plugins.values}set plugins(a){this.registry.plugins.values=a}get modifiers(){return this.registry.modifiers.values}set modifiers(a){this.registry.modifiers.values=a}get sensors(){return this.registry.sensors.values}set sensors(a){this.registry.sensors.values=a}},e9=a=>{throw TypeError(a)},fa=(a,b,c)=>b.has(a)||e9("Cannot "+c),fb=(a,b,c)=>(fa(a,b,"read from private field"),b.get(a)),fc=(a,b,c)=>b.has(a)?e9("Cannot add the same private member more than once"):b instanceof WeakSet?b.add(a):b.set(a,c),fd=(a,b,c,d)=>(fa(a,b,"write to private field"),b.set(a,c),c),fe=(a,b,c)=>(fa(a,b,"access private method"),c);function ff(a){return!!a&&(a instanceof KeyframeEffect||"getKeyframes"in a&&"function"==typeof a.getKeyframes)}function fg(a,b){let c=a.getAnimations(),d=null;for(let a of c){if("running"!==a.playState)continue;let{effect:c}=a,e=(ff(c)?c.getKeyframes():[]).filter(b);e.length>0&&(d=[e[e.length-1],a])}return d}function fh(a){let{width:b,height:c,top:d,left:e,bottom:f,right:g}=a.getBoundingClientRect();return{width:b,height:c,top:d,left:e,bottom:f,right:g}}function fi(a){let b=Object.prototype.toString.call(a);return"[object Window]"===b||"[object global]"===b}function fj(a){return"nodeType"in a}function fk(a){var b,c,d;return a?fi(a)?a:fj(a)?"defaultView"in a?null!=(b=a.defaultView)?b:window:null!=(d=null==(c=a.ownerDocument)?void 0:c.defaultView)?d:window:window:window}function fl(a){let{Document:b}=fk(a);return a instanceof b||"nodeType"in a&&a.nodeType===Node.DOCUMENT_NODE}function fm(a){return!(!a||fi(a))&&(a instanceof fk(a).HTMLElement||"namespaceURI"in a&&"string"==typeof a.namespaceURI&&a.namespaceURI.endsWith("html"))}function fn(a){return a instanceof fk(a).SVGElement||"namespaceURI"in a&&"string"==typeof a.namespaceURI&&a.namespaceURI.endsWith("svg")}function fo(a){return a?fi(a)?a.document:fj(a)?fl(a)?a:fm(a)||fn(a)?a.ownerDocument:document:document:document}function fp(a,b=a.getBoundingClientRect(),c=0){var d,e,f,g,h;let i=b,{ownerDocument:j}=a,k=null!=(d=j.defaultView)?d:window,l=a.parentElement;for(;l&&l!==j.documentElement;){if(!function(a){if("DETAILS"===a.tagName&&!1===a.open)return!1;let{overflow:b,overflowX:c,overflowY:d}=getComputedStyle(a);return"visible"===b&&"visible"===c&&"visible"===d}(l)){let a=l.getBoundingClientRect(),b=c*(a.bottom-a.top),d=c*(a.right-a.left),e=c*(a.bottom-a.top),f=c*(a.right-a.left);(i={top:Math.max(i.top,a.top-b),right:Math.min(i.right,a.right+d),bottom:Math.min(i.bottom,a.bottom+e),left:Math.max(i.left,a.left-f),width:0,height:0}).width=i.right-i.left,i.height=i.bottom-i.top}l=l.parentElement}let m=k.visualViewport,n=null!=(e=null==m?void 0:m.offsetTop)?e:0,o=null!=(f=null==m?void 0:m.offsetLeft)?f:0,p=null!=(g=null==m?void 0:m.width)?g:k.innerWidth,q=null!=(h=null==m?void 0:m.height)?h:k.innerHeight,r=c*q,s=c*p;return(i={top:Math.max(i.top,n-r),right:Math.min(i.right,o+p+s),bottom:Math.min(i.bottom,n+q+r),left:Math.max(i.left,o-s),width:0,height:0}).width=i.right-i.left,i.height=i.bottom-i.top,i.width<0&&(i.width=0),i.height<0&&(i.height=0),i}function fq(a){return{x:a.clientX,y:a.clientY}}function fr(){return/^((?!chrome|android).)*safari/i.test(navigator.userAgent)}function fs(){var a,b;let c=fr()?window.visualViewport:null;return{x:null!=(a=null==c?void 0:c.offsetLeft)?a:0,y:null!=(b=null==c?void 0:c.offsetTop)?b:0}}function ft(a){return!!a&&!!fj(a)&&a instanceof fk(a).ShadowRoot}function fu(a){if(a&&fj(a)){let b=a.getRootNode();if(ft(b)||b instanceof Document)return b}return fo(a)}function fv(a){return a.matchMedia("(prefers-reduced-motion: reduce)").matches}function fw(a){return"value"in a}function fx(a){return"CANVAS"===a.tagName}var fy=new WeakMap,fz=class{constructor(){this.entries=new Set,this.clear=()=>{for(let a of this.entries){let[b,{type:c,listener:d,options:e}]=a;b.removeEventListener(c,d,e)}this.entries.clear()}}bind(a,b){let c=Array.isArray(a)?a:[a],d=Array.isArray(b)?b:[b],e=[];for(let a of c)for(let b of d){let{type:c,listener:d,options:f}=b,g=[a,b];a.addEventListener(c,d,f),this.entries.add(g),e.push(g)}let f=this.entries;return function(){for(let a of e){let[b,{type:c,listener:d,options:e}]=a;b.removeEventListener(c,d,e),f.delete(a)}}}};function fA(a){let b=null==a?void 0:a.ownerDocument.defaultView;if(b&&b.self!==b.parent)return b.frameElement}function fB(a,b){let c,d;return function(...e){let f=this;if(d){let g;null==c||c(),g=setTimeout(()=>{a.apply(f,e),d=performance.now()},b-(performance.now()-d)),c=()=>clearTimeout(g)}else a.apply(f,e),d=performance.now()}}var fC=class{observe(){}unobserve(){}disconnect(){}},fD=class extends fC{constructor(a){super(b=>{fb(this,a9)?a(b,this):fd(this,a9,!0)}),fc(this,a9,!1)}};a9=new WeakMap;var fE=Array.from({length:100},(a,b)=>b/100),fF=class{constructor(a,b,c={debug:!1,skipInitial:!1}){this.element=a,this.callback=b,fc(this,bi),this.disconnect=()=>{var a,b,c;fd(this,bg,!0),null==(a=fb(this,bc))||a.disconnect(),null==(b=fb(this,bd))||b.disconnect(),fb(this,be).disconnect(),null==(c=fb(this,bf))||c.remove()},fc(this,ba,!0),fc(this,bb),fc(this,bc),fc(this,bd),fc(this,be),fc(this,bf),fc(this,bg,!1),fc(this,bh,fB(()=>{var a,b,c;let{element:d}=this;if(null==(a=fb(this,bd))||a.disconnect(),fb(this,bg)||!fb(this,ba)||!d.isConnected)return;let e=null!=(b=d.ownerDocument)?b:document,{innerHeight:f,innerWidth:g}=null!=(c=e.defaultView)?c:window,h=d.getBoundingClientRect(),{top:i,left:j,bottom:k,right:l}=fp(d,h),m=-Math.floor(i),n=-Math.floor(j),o=-Math.floor(g-l),p=-Math.floor(f-k),q=`${m}px ${o}px ${p}px ${n}px`;this.boundingClientRect=h,fd(this,bd,new IntersectionObserver(a=>{let[b]=a,{intersectionRect:c}=b;1!==(1!==b.intersectionRatio?b.intersectionRatio:d9.intersectionRatio(c,fp(d)))&&fb(this,bh).call(this)},{threshold:fE,rootMargin:q,root:e})),fb(this,bd).observe(d),fe(this,bi,bj).call(this)},75)),this.boundingClientRect=a.getBoundingClientRect(),fd(this,ba,function(a,b=a.getBoundingClientRect()){let{width:c,height:d}=fp(a,b);return c>0&&d>0}(a,this.boundingClientRect));let d=!0;this.callback=a=>{d&&(d=!1,c.skipInitial)||b(a)};const e=a.ownerDocument;(null==c?void 0:c.debug)&&(fd(this,bf,document.createElement("div")),fb(this,bf).style.background="rgba(0,0,0,0.15)",fb(this,bf).style.position="fixed",fb(this,bf).style.pointerEvents="none",e.body.appendChild(fb(this,bf))),fd(this,be,new IntersectionObserver(b=>{var c,d;let{boundingClientRect:e,isIntersecting:f}=b[b.length-1],{width:g,height:h}=e,i=fb(this,ba);fd(this,ba,f),(g||h)&&(i&&!f?(null==(c=fb(this,bd))||c.disconnect(),this.callback(null),null==(d=fb(this,bc))||d.disconnect(),fd(this,bc,void 0),fb(this,bf)&&(fb(this,bf).style.visibility="hidden")):fb(this,bh).call(this),f&&!fb(this,bc)&&(fd(this,bc,new fD(fb(this,bh))),fb(this,bc).observe(a)))},{threshold:fE,root:e})),fb(this,ba)&&!c.skipInitial&&this.callback(this.boundingClientRect),fb(this,be).observe(a)}};ba=new WeakMap,bb=new WeakMap,bc=new WeakMap,bd=new WeakMap,be=new WeakMap,bf=new WeakMap,bg=new WeakMap,bh=new WeakMap,bi=new WeakSet,bj=function(){var a,b;!fb(this,bg)&&(fe(this,bi,bk).call(this),(a=this.boundingClientRect)===(b=fb(this,bb))||a&&b&&a.top==b.top&&a.left==b.left&&a.right==b.right&&a.bottom==b.bottom||(this.callback(this.boundingClientRect),fd(this,bb,this.boundingClientRect)))},bk=function(){if(fb(this,bf)){let{top:a,left:b,width:c,height:d}=fp(this.element);fb(this,bf).style.overflow="hidden",fb(this,bf).style.visibility="visible",fb(this,bf).style.top=`${Math.floor(a)}px`,fb(this,bf).style.left=`${Math.floor(b)}px`,fb(this,bf).style.width=`${Math.floor(c)}px`,fb(this,bf).style.height=`${Math.floor(d)}px`}};var fG=new WeakMap,fH=new WeakMap,fI=class{constructor(a,b,c){this.callback=b,fc(this,bl),fc(this,bm,!1),fc(this,bn),fc(this,bo,fB(a=>{if(!fb(this,bm)&&a.target&&"contains"in a.target&&"function"==typeof a.target.contains){for(let b of fb(this,bn))if(a.target.contains(b)){this.callback(fb(this,bl).boundingClientRect);break}}},75));const d=function(a){let b=new Set,c=fA(a);for(;c;)b.add(c),c=fA(c);return b}(a),e=function(a,b){let c=new Set;for(let d of a){let a=function(a,b){let c=fG.get(a);return c||(c={disconnect:new fF(a,b=>{let c=fG.get(a);c&&c.callbacks.forEach(a=>a(b))},{skipInitial:!0}).disconnect,callbacks:new Set}),c.callbacks.add(b),fG.set(a,c),()=>{c.callbacks.delete(b),0===c.callbacks.size&&(fG.delete(a),c.disconnect())}}(d,b);c.add(a)}return()=>c.forEach(a=>a())}(d,b),f=function(a,b){var c;let d=a.ownerDocument;if(!fH.has(d)){let a=new AbortController,b=new Set;document.addEventListener("scroll",a=>b.forEach(b=>b(a)),{capture:!0,passive:!0,signal:a.signal}),fH.set(d,{disconnect:()=>a.abort(),listeners:b})}let{listeners:e,disconnect:f}=null!=(c=fH.get(d))?c:{};return e&&f?(e.add(b),()=>{e.delete(b),0===e.size&&(f(),fH.delete(d))}):()=>{}}(a,fb(this,bo));fd(this,bn,d),fd(this,bl,new fF(a,b,c)),this.disconnect=()=>{fb(this,bm)||(fd(this,bm,!0),e(),f(),fb(this,bl).disconnect())}}};function fJ(a){return"showPopover"in a&&"hidePopover"in a&&"function"==typeof a.showPopover&&"function"==typeof a.hidePopover}function fK(a){try{fJ(a)&&a.isConnected&&a.hasAttribute("popover")&&!a.matches(":popover-open")&&a.showPopover()}catch(a){}}function fL(a){let b=fk(a),c=fh(a),d=(b.visualViewport,{height:a.clientHeight,width:a.clientWidth}),e={current:{x:a.scrollLeft,y:a.scrollTop},max:{x:a.scrollWidth-d.width,y:a.scrollHeight-d.height}},f=e.current.y<=0,g=e.current.x<=0,h=e.current.y>=e.max.y,i=e.current.x>=e.max.x;return{rect:c,position:e,isTop:f,isLeft:g,isBottom:h,isRight:i}}bl=new WeakMap,bm=new WeakMap,bn=new WeakMap,bo=new WeakMap;var fM=class{constructor(a){this.scheduler=a,this.pending=!1,this.tasks=new Set,this.resolvers=new Set,this.flush=()=>{let{tasks:a,resolvers:b}=this;for(let b of(this.pending=!1,this.tasks=new Set,this.resolvers=new Set,a))b();for(let a of b)a()}}schedule(a){return this.tasks.add(a),this.pending||(this.pending=!0,this.scheduler(this.flush)),new Promise(a=>this.resolvers.add(a))}},fN=new fM(a=>{"function"==typeof requestAnimationFrame?requestAnimationFrame(a):a()}),fO=new fM(a=>setTimeout(a,50)),fP=new Map,fQ=fP.clear.bind(fP);function fR(a,b=!1){if(!b)return fS(a);let c=fP.get(a);return c||(c=fS(a),fP.set(a,c),fO.schedule(fQ)),c}function fS(a){return fk(a).getComputedStyle(a)}var fT={excludeElement:!0,escapeShadowDOM:!0};function fU(a,b=fT){let{limit:c,excludeElement:d,escapeShadowDOM:e}=b,f=new Set;return a?function b(g){if(null!=c&&f.size>=c||!g)return f;if(fl(g)&&null!=g.scrollingElement&&!f.has(g.scrollingElement))return f.add(g.scrollingElement),f;if(e&&ft(g))return b(g.host);if(!fm(g))return fn(g)?b(g.parentElement):f;if(f.has(g))return f;let h=fR(g,!0);if(d&&g===a||function(a,b=fR(a,!0)){let c=/(auto|scroll|overlay)/;return["overflow","overflowX","overflowY"].some(a=>{let d=b[a];return"string"==typeof d&&c.test(d)})}(g,h)&&f.add(g),function(a,b=fR(a,!0)){return"fixed"===b.position||"sticky"===b.position}(g,h)){let{scrollingElement:a}=g.ownerDocument;return a&&f.add(a),f}return b(g.parentNode)}(a):f}function fV(a,b=window.frameElement){let c={x:0,y:0,scaleX:1,scaleY:1};if(!a)return c;let d=fA(a);for(;d&&d!==b;){let a=fh(d),{x:b,y:e}=function(a,b=fh(a)){let c=Math.round(b.width),d=Math.round(b.height);if(fm(a))return{x:c/a.offsetWidth,y:d/a.offsetHeight};let e=fR(a,!0);return{x:(parseFloat(e.width)||c)/c,y:(parseFloat(e.height)||d)/d}}(d,a);c.x=c.x+a.left,c.y=c.y+a.top,c.scaleX=c.scaleX*b,c.scaleY=c.scaleY*e,d=fA(d)}return c}function fW(a){if("none"===a)return null;let[b,c,d="0"]=a.split(" "),e={x:parseFloat(b),y:parseFloat(c),z:parseInt(d,10)};return isNaN(e.x)&&isNaN(e.y)?null:{x:isNaN(e.x)?0:e.x,y:isNaN(e.y)?0:e.y,z:isNaN(e.z)?0:e.z}}function fX(a){var b,c,d,e,f,g,h,i,j;let{scale:k,transform:l,translate:m}=a,n=function(a){if("none"===a)return null;let b=a.split(" "),c=parseFloat(b[0]),d=parseFloat(b[1]);return isNaN(c)&&isNaN(d)?null:{x:isNaN(c)?d:c,y:isNaN(d)?c:d}}(k),o=fW(m),p=function(a){if(a.startsWith("matrix3d(")){let b=a.slice(9,-1).split(/, /);return{x:+b[12],y:+b[13],scaleX:+b[0],scaleY:+b[5]}}if(a.startsWith("matrix(")){let b=a.slice(7,-1).split(/, /);return{x:+b[4],y:+b[5],scaleX:+b[0],scaleY:+b[3]}}return null}(l);if(!p&&!n&&!o)return null;let q={x:null!=(b=null==n?void 0:n.x)?b:1,y:null!=(c=null==n?void 0:n.y)?c:1},r={x:null!=(d=null==o?void 0:o.x)?d:0,y:null!=(e=null==o?void 0:o.y)?e:0},s={x:null!=(f=null==p?void 0:p.x)?f:0,y:null!=(g=null==p?void 0:p.y)?g:0,scaleX:null!=(h=null==p?void 0:p.scaleX)?h:1,scaleY:null!=(i=null==p?void 0:p.scaleY)?i:1};return{x:r.x+s.x,y:r.y+s.y,z:null!=(j=null==o?void 0:o.z)?j:0,scaleX:q.x*s.scaleX,scaleY:q.y*s.scaleY}}var fY=((o=fY||{})[o.Idle=0]="Idle",o[o.Forward=1]="Forward",o[o.Reverse=-1]="Reverse",o),fZ={x:.2,y:.2},f$={x:10,y:10};function f_(a,{block:b="nearest",inline:c="nearest"}={}){if(!fm(a))return;let d=fU(a),e=[];for(let f of d){if(!fm(f))continue;let{top:d,left:g}=function(a,b){let c=f0(a),d=f0(b);return{top:c.top-d.top-b.clientTop,left:c.left-d.left-b.clientLeft}}(a,f),h=d,i=g;for(let a of e)h-=a.scrollTop,i-=a.scrollLeft;if("none"!==b){let c=h<f.scrollTop;c!==h+a.offsetHeight>f.scrollTop+f.clientHeight&&("center"===b?f.scrollTop=h-f.clientHeight/2+a.offsetHeight/2:c?f.scrollTop=h:f.scrollTop=h+a.offsetHeight-f.clientHeight)}if("none"!==c){let b=i<f.scrollLeft;b!==i+a.offsetWidth>f.scrollLeft+f.clientWidth&&("center"===c?f.scrollLeft=i-f.clientWidth/2+a.offsetWidth/2:b?f.scrollLeft=i:f.scrollLeft=i+a.offsetWidth-f.clientWidth)}e.push(f)}}function f0(a){let b=0,c=0,d=a;for(;d;){b+=d.offsetTop,c+=d.offsetLeft;let a=d.offsetParent;if(!fm(a))break;b+=a.clientTop,c+=a.clientLeft,d=a}return{top:b,left:c}}function f1({element:a,keyframes:b,options:c}){return a.animate(b,c).finished}function f2(a,b=fR(a).translate,c=!0){if(c){let b=fg(a,a=>"translate"in a);if(b){let{translate:a=""}=b[0];if("string"==typeof a){let b=fW(a);if(b)return b}}}if(b){let a=fW(b);if(a)return a}return{x:0,y:0,z:0}}var f3=new fM(a=>setTimeout(a,0)),f4=new Map,f5=f4.clear.bind(f4),f6=class extends d9{constructor(a,b={}){var c,d,e,f;let g;const{frameTransform:h=fV(a),ignoreTransforms:i,getBoundingClientRect:j=fh}=b,k=function(a,b){let c=(function(a){let b=a.ownerDocument,c=f4.get(b);if(c)return c;c=b.getAnimations(),f4.set(b,c),f3.schedule(f5);let d=c.filter(b=>ff(b.effect)&&b.effect.target===a);return f4.set(a,d),c})(a).filter(a=>{var c,d;if(ff(a.effect)){let{target:e}=a.effect;if(null==(d=e&&(null==(c=b.isValidTarget)?void 0:c.call(b,e)))||d)return a.effect.getKeyframes().some(a=>{for(let c of b.properties)if(a[c])return!0})}}).map(a=>{let{effect:b,currentTime:c}=a,d=null==b?void 0:b.getComputedTiming().duration;if(!a.pending&&"finished"!==a.playState&&"number"==typeof d&&"number"==typeof c&&c<d)return a.currentTime=d,()=>{a.currentTime=c}});if(c.length>0)return()=>c.forEach(a=>null==a?void 0:a())}(a,{properties:["transform","translate","scale","width","height"],isValidTarget:b=>(b!==a||fr())&&b.contains(a)}),l=j(a);let{top:m,left:n,width:o,height:p}=l;const q=fR(a),r=fX(q),s={x:null!=(c=null==r?void 0:r.scaleX)?c:1,y:null!=(d=null==r?void 0:r.scaleY)?d:1},t=function(a,b){let c,d,e,f=a.getAnimations();if(!f.length)return null;let g=!1;for(let a of f){if("running"!==a.playState)continue;let b=ff(a.effect)?a.effect.getKeyframes():[],f=b[b.length-1];if(!f)continue;let{transform:h,translate:i,scale:j}=f;"string"==typeof h&&h&&(c=h,g=!0),"string"==typeof i&&i&&(d=i,g=!0),"string"==typeof j&&j&&(e=j,g=!0)}return g?fX({transform:null!=c?c:b.transform,translate:null!=d?d:b.translate,scale:null!=e?e:b.scale}):null}(a,q);null==k||k(),r&&(g=function(a,b,c){let{scaleX:d,scaleY:e,x:f,y:g}=b,h=a.left-f-(1-d)*parseFloat(c),i=a.top-g-(1-e)*parseFloat(c.slice(c.indexOf(" ")+1)),j=d?a.width/d:a.width,k=e?a.height/e:a.height;return{width:j,height:k,top:i,right:h+j,bottom:i+k,left:h}}(l,r,q.transformOrigin),(i||t)&&(m=g.top,n=g.left,o=g.width,p=g.height));const u={width:null!=(e=null==g?void 0:g.width)?e:o,height:null!=(f=null==g?void 0:g.height)?f:p};if(t&&!i&&g){const a=function(a,b,c){let{scaleX:d,scaleY:e,x:f,y:g}=b,h=a.left+f+(1-d)*parseFloat(c),i=a.top+g+(1-e)*parseFloat(c.slice(c.indexOf(" ")+1)),j=d?a.width*d:a.width,k=e?a.height*e:a.height;return{width:j,height:k,top:i,right:h+j,bottom:i+k,left:h}}(g,t,q.transformOrigin);m=a.top,n=a.left,o=a.width,p=a.height,s.x=t.scaleX,s.y=t.scaleY}h&&(i||(n*=h.scaleX,o*=h.scaleX,m*=h.scaleY,p*=h.scaleY),n+=h.x,m+=h.y),super(n,m,o,p),this.scale=s,this.intrinsicWidth=u.width,this.intrinsicHeight=u.height}};function f7(a){return"style"in a&&"object"==typeof a.style&&null!==a.style&&"setProperty"in a.style&&"removeProperty"in a.style&&"function"==typeof a.style.setProperty&&"function"==typeof a.style.removeProperty}var f8=class{constructor(a){this.element=a,this.initial=new Map}set(a,b=""){let{element:c}=this;if(f7(c))for(let[d,e]of Object.entries(a)){let a=`${b}${d}`;this.initial.has(a)||this.initial.set(a,c.style.getPropertyValue(a)),c.style.setProperty(a,"string"==typeof e?e:`${e}px`)}}remove(a,b=""){let{element:c}=this;if(f7(c))for(let d of a){let a=`${b}${d}`;c.style.removeProperty(a)}}reset(){let{element:a}=this;if(f7(a)){for(let[b,c]of this.initial)a.style.setProperty(b,c);""===a.getAttribute("style")&&a.removeAttribute("style")}}};function f9(a){return!!a&&(a instanceof fk(a).Element||fj(a)&&a.nodeType===Node.ELEMENT_NODE)}function ga(a){if(!a)return!1;let{KeyboardEvent:b}=fk(a.target);return a instanceof b}var gb={};function gc(a){let b=null==gb[a]?0:gb[a]+1;return gb[a]=b,`${a}-${b}`}var gd=a=>{var b;return null!=(b=(({dragOperation:a,droppable:b})=>{let c=a.position.current;if(!c)return null;let{id:d}=b;return b.shape&&b.shape.containsPoint(c)?{id:d,value:1/d8.distance(b.shape.center,c),type:eZ.PointerIntersection,priority:eY.High}:null})(a))?b:(({dragOperation:a,droppable:b})=>{let{shape:c}=a;if(!b.shape||!(null==c?void 0:c.current))return null;let d=c.current.intersectionArea(b.shape);if(d){let{position:e}=a,f=d8.distance(b.shape.center,e.current),g=d/(c.current.area+b.shape.area-d);return{id:b.id,value:g/f,type:eZ.ShapeIntersection,priority:eY.Normal}}return null})(a)},ge=a=>{let{dragOperation:b,droppable:c}=a,{shape:d,position:e}=b;if(!c.shape)return null;let f=d?d9.from(d.current.boundingRectangle).corners:void 0,g=d9.from(c.shape.boundingRectangle).corners.reduce((a,b,c)=>{var d;return a+d8.distance(d8.from(b),null!=(d=null==f?void 0:f[c])?d:e.current)},0);return{id:c.id,value:1/(g/4),type:eZ.Collision,priority:eY.Normal}},gf=Object.create,gg=Object.defineProperty,gh=Object.defineProperties,gi=Object.getOwnPropertyDescriptor,gj=Object.getOwnPropertyDescriptors,gk=Object.getOwnPropertySymbols,gl=Object.prototype.hasOwnProperty,gm=Object.prototype.propertyIsEnumerable,gn=(a,b)=>(b=Symbol[a])?b:Symbol.for("Symbol."+a),go=a=>{throw TypeError(a)},gp=(a,b,c)=>b in a?gg(a,b,{enumerable:!0,configurable:!0,writable:!0,value:c}):a[b]=c,gq=(a,b)=>{for(var c in b||(b={}))gl.call(b,c)&&gp(a,c,b[c]);if(gk)for(var c of gk(b))gm.call(b,c)&&gp(a,c,b[c]);return a},gr=(a,b)=>gg(a,"name",{value:b,configurable:!0}),gs=(a,b)=>{var c={};for(var d in a)gl.call(a,d)&&0>b.indexOf(d)&&(c[d]=a[d]);if(null!=a&&gk)for(var d of gk(a))0>b.indexOf(d)&&gm.call(a,d)&&(c[d]=a[d]);return c},gt=a=>{var b;return[,,,gf(null!=(b=null==a?void 0:a[gn("metadata")])?b:null)]},gu=["class","method","getter","setter","accessor","field","value","get","set"],gv=a=>void 0!==a&&"function"!=typeof a?go("Function expected"):a,gw=(a,b,c,d,e)=>({kind:gu[a],name:b,metadata:d,addInitializer:a=>c._?go("Already initialized"):e.push(gv(a||null))}),gx=(a,b)=>gp(b,gn("metadata"),a[3]),gy=(a,b,c,d)=>{for(var e=0,f=a[b>>1],g=f&&f.length;e<g;e++)1&b?f[e].call(c):d=f[e].call(c,d);return d},gz=(a,b,c,d,e,f)=>{var g,h,i,j,k,l=7&b,m=!!(8&b),n=!!(16&b),o=l>3?a.length+1:l?m?1:2:0,p=gu[l+5],q=l>3&&(a[o-1]=[]),r=a[o]||(a[o]=[]),s=l&&(n||m||(e=e.prototype),l<5&&(l>3||!n)&&gi(l<4?e:{get[c](){return gC(this,f)},set[c](x){return gE(this,f,x)}},c));l?n&&l<4&&gr(f,(l>2?"set ":l>1?"get ":"")+c):gr(e,c);for(var t=d.length-1;t>=0;t--)j=gw(l,c,i={},a[3],r),l&&(j.static=m,j.private=n,k=j.access={has:n?a=>gB(e,a):a=>c in a},3^l&&(k.get=n?a=>(1^l?gC:gF)(a,e,4^l?f:s.get):a=>a[c]),l>2&&(k.set=n?(a,b)=>gE(a,e,b,4^l?f:s.set):(a,b)=>a[c]=b)),h=(0,d[t])(l?l<4?n?f:s[p]:l>4?void 0:{get:s.get,set:s.set}:e,j),i._=1,4^l||void 0===h?gv(h)&&(l>4?q.unshift(h):l?n?f=h:s[p]=h:e=h):"object"!=typeof h||null===h?go("Object expected"):(gv(g=h.get)&&(s.get=g),gv(g=h.set)&&(s.set=g),gv(g=h.init)&&q.unshift(g));return l||gx(a,e),s&&gg(e,c,s),n?4^l?f:s:e},gA=(a,b,c)=>b.has(a)||go("Cannot "+c),gB=(a,b)=>Object(b)!==b?go('Cannot use the "in" operator on this value'):a.has(b),gC=(a,b,c)=>(gA(a,b,"read from private field"),c?c.call(a):b.get(a)),gD=(a,b,c)=>b.has(a)?go("Cannot add the same private member more than once"):b instanceof WeakSet?b.add(a):b.set(a,c),gE=(a,b,c,d)=>(gA(a,b,"write to private field"),d?d.call(a,c):b.set(a,c),c),gF=(a,b,c)=>(gA(a,b,"access private method"),c),gG={draggable:"To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item in a given direction. Press space again to drop the item in its new position, or press escape to cancel."},gH={dragstart({operation:{source:a}}){if(a)return`Picked up draggable item ${a.id}.`},dragover({operation:{source:a,target:b}}){if(a&&a.id!==(null==b?void 0:b.id))return b?`Draggable item ${a.id} was moved over droppable target ${b.id}.`:`Draggable item ${a.id} is no longer over a droppable target.`},dragend({operation:{source:a,target:b},canceled:c}){if(a)return c?`Dragging was cancelled. Draggable item ${a.id} was dropped.`:b?`Draggable item ${a.id} was dropped over droppable target ${b.id}`:`Draggable item ${a.id} was dropped.`}},gI=["dragover","dragmove"],gJ=class extends eJ{constructor(a,b){let c,d,e,f;super(a);const{id:g,idPrefix:{description:h="dnd-kit-description",announcement:i="dnd-kit-announcement"}={},announcements:j=gH,screenReaderInstructions:k=gG,debounce:l=500}=null!=b?b:{},m=g?`${h}-${g}`:gc(h),n=g?`${i}-${g}`:gc(i),o=(a=f)=>{e&&a&&(null==e?void 0:e.nodeValue)!==a&&(e.nodeValue=a)},p=()=>fN.schedule(o),q=function(a,b){let c,d=()=>{clearTimeout(c),c=setTimeout(a,b)};return d.cancel=()=>clearTimeout(c),d}(p,l),r=Object.entries(j).map(([a,b])=>this.manager.monitor.addEventListener(a,(c,d)=>{let g=e;if(!g)return;let h=null==b?void 0:b(c,d);h&&g.nodeValue!==h&&(f=h,gI.includes(a)?q():(p(),q.cancel()))})),s=()=>{var a;let b=[];if(!(null==c?void 0:c.isConnected)){let d;a=k.draggable,(d=document.createElement("div")).id=m,d.style.setProperty("display","none"),d.textContent=a,c=d,b.push(c)}if(!(null==d?void 0:d.isConnected)){let a;(a=document.createElement("div")).id=n,a.setAttribute("role","status"),a.setAttribute("aria-live","polite"),a.setAttribute("aria-atomic","true"),a.style.setProperty("position","fixed"),a.style.setProperty("width","1px"),a.style.setProperty("height","1px"),a.style.setProperty("margin","-1px"),a.style.setProperty("border","0"),a.style.setProperty("padding","0"),a.style.setProperty("overflow","hidden"),a.style.setProperty("clip","rect(0 0 0 0)"),a.style.setProperty("clip-path","inset(100%)"),a.style.setProperty("white-space","nowrap"),d=a,e=document.createTextNode(""),d.appendChild(e),b.push(d)}b.length>0&&document.body.append(...b)},t=new Set;function u(){for(let a of t)a()}this.registerEffect(()=>{var a;for(let b of(t.clear(),this.manager.registry.draggables.value)){let e=null!=(a=b.handle)?a:b.element;if(e){for(let a of(c&&d||t.add(s),(!["input","select","textarea","a","button"].includes(e.tagName.toLowerCase())||fr())&&!e.hasAttribute("tabindex")&&t.add(()=>e.setAttribute("tabindex","0")),e.hasAttribute("role")||"button"===e.tagName.toLowerCase()||t.add(()=>e.setAttribute("role","button")),e.hasAttribute("aria-roledescription")||t.add(()=>e.setAttribute("aria-roledescription","draggable")),e.hasAttribute("aria-describedby")||t.add(()=>e.setAttribute("aria-describedby",m)),["aria-pressed","aria-grabbed"])){let c=String(b.isDragging);e.getAttribute(a)!==c&&t.add(()=>e.setAttribute(a,c))}let a=String(b.disabled);e.getAttribute("aria-disabled")!==a&&t.add(()=>e.setAttribute("aria-disabled",a))}}t.size>0&&fN.schedule(u)}),this.destroy=()=>{super.destroy(),null==c||c.remove(),null==d||d.remove(),r.forEach(a=>a())}}},gK=new Map,gL=class extends(bt=eK,bs=[dI],br=[dJ],bq=[dJ],bp=[dJ],bt){constructor(a,b){super(a,b),gy(bv,5,this),gD(this,bx),gD(this,bu,new Set),gD(this,bw,gy(bv,8,this,new Set)),gy(bv,11,this),this.registerEffect(gF(this,bx,by))}register(a){return gC(this,bu).add(a),()=>{gC(this,bu).delete(a)}}addRoot(a){return c_(()=>{let b=new Set(this.additionalRoots);b.add(a),this.additionalRoots=b}),()=>{c_(()=>{let b=new Set(this.additionalRoots);b.delete(a),this.additionalRoots=b})}}get sourceRoot(){var a;let{source:b}=this.manager.dragOperation;return fu(null!=(a=null==b?void 0:b.element)?a:null)}get targetRoot(){var a;let{target:b}=this.manager.dragOperation;return fu(null!=(a=null==b?void 0:b.element)?a:null)}get roots(){let{status:a}=this.manager.dragOperation;return a.initializing||a.initialized?new Set([...[this.sourceRoot,this.targetRoot].filter(a=>null!=a),...this.additionalRoots]):new Set}};bv=gt(bt),bu=new WeakMap,bw=new WeakMap,bx=new WeakSet,by=function(){let{roots:a}=this,b=[];for(let c of a)for(let a of gC(this,bu))b.push(gF(this,bx,bz).call(this,c,a));return()=>{for(let a of b)a()}},bz=function(a,b){let c=gK.get(a);c||(c=new Map,gK.set(a,c));let d=c.get(b);if(!d){let e=fl(a)?gF(this,bx,bA).call(this,a,c,b):gF(this,bx,bB).call(this,a,c,b);if(!e)return()=>{};d=e,c.set(b,d)}d.refCount++;let e=!1;return()=>{e||(e=!0,d.refCount--,0===d.refCount&&d.cleanup())}},bA=function(a,b,c){var d;let e=a.createElement("style"),{nonce:f}=null!=(d=this.options)?d:{};f&&e.setAttribute("nonce",f),e.textContent=c,a.head.prepend(e);let g=new MutationObserver(b=>{for(let c of b)for(let b of Array.from(c.removedNodes))if(b===e)return void a.head.prepend(e)});return g.observe(a.head,{childList:!0}),{refCount:0,cleanup:()=>{g.disconnect(),e.remove(),b.delete(c),0===b.size&&gK.delete(a)}}},bB=function(a,b,c){"adoptedStyleSheets"in a&&Array.isArray(a.adoptedStyleSheets);let d=a.ownerDocument.defaultView,{CSSStyleSheet:e}=null!=d?d:{};if(!e)return null;let f=new e;return f.replaceSync(c),a.adoptedStyleSheets.push(f),{refCount:0,cleanup:()=>{var d;if(ft(a)&&(null==(d=a.host)?void 0:d.isConnected)){let b=a.adoptedStyleSheets.indexOf(f);-1!==b&&a.adoptedStyleSheets.splice(b,1)}b.delete(c),0===b.size&&gK.delete(a)}}},gz(bv,4,"additionalRoots",bs,gL,bw),gz(bv,2,"sourceRoot",br,gL),gz(bv,2,"targetRoot",bq,gL),gz(bv,2,"roots",bp,gL),gx(bv,gL),gL.configure=eH(gL);var gM=class extends eJ{constructor(a,b){super(a,b),this.manager=a;const{cursor:c="grabbing"}=null!=b?b:{},d=a.registry.plugins.get(gL),e=null==d?void 0:d.register(`* { cursor: ${c} !important; }`);if(e){const a=this.destroy.bind(this);this.destroy=()=>{e(),a()}}}},gN="data-dnd-",gO=`${gN}dropping`,gP="--dnd-",gQ=`${gN}dragging`,gR=`${gN}placeholder`,gS=[gQ,gR,"popover","aria-pressed","aria-grabbing"],gT=["view-transition-name"],gU=`
  :is(:root,:host) [${gQ}] {
    position: fixed !important;
    pointer-events: none !important;
    touch-action: none;
    z-index: calc(infinity);
    will-change: translate;
    top: var(${gP}top, 0px) !important;
    left: var(${gP}left, 0px) !important;
    right: unset !important;
    bottom: unset !important;
    width: var(${gP}width, auto);
    max-width: var(${gP}width, auto);
    height: var(${gP}height, auto);
    max-height: var(${gP}height, auto);
    transform: var(${gP}transform, none) !important;
    transition: var(${gP}transition) !important;
  }

  :is(:root,:host) [${gR}] {
    transition: none;
  }

  :is(:root,:host) [${gR}='hidden'] {
    visibility: hidden;
  }

  [${gQ}] * {
    pointer-events: none !important;
  }

  [${gQ}]:not([${gO}]) {
    translate: var(${gP}translate) !important;
  }

  [${gQ}][style*='${gP}scale'] {
    scale: var(${gP}scale) !important;
    transform-origin: var(${gP}transform-origin) !important;
  }

  @layer dnd-kit {
    :where([${gQ}][popover]) {
      overflow: visible;
      background: unset;
      border: unset;
      margin: unset;
      padding: unset;
      color: inherit;

      &:is(input, button) {
        border: revert;
        background: revert;
      }
    }
  }
  [${gQ}]::backdrop, [${gN}overlay]:not([${gQ}]) {
    display: none;
    visibility: hidden;
  }
`.replace(/\n+/g," ").replace(/\s+/g," ").trim();function gV(a,b){return a===b||fA(a)===fA(b)}function gW(a){let{target:b}=a;"newState"in a&&"closed"===a.newState&&f9(b)&&b.hasAttribute("popover")&&requestAnimationFrame(()=>fK(b))}function gX(a){return"TR"===a.tagName}var gY=class extends(bD=eJ,bC=[dI],bD){constructor(a,b){super(a,b),gD(this,bG),gD(this,bF,gy(bE,8,this)),gy(bE,11,this),this.state={initial:{},current:{}};const c=a.registry.plugins.get(gL),d=null==c?void 0:c.register(gU);if(d){const a=this.destroy.bind(this);this.destroy=()=>{d(),a()}}this.registerEffect(gF(this,bG,bH).bind(this,c)),this.registerEffect(gF(this,bG,bI))}};bE=gt(bD),bF=new WeakMap,bG=new WeakSet,bH=function(a){let{overlay:b}=this;if(!b||!a)return;let c=fu(b);if(c)return a.addRoot(c)},bI=function(){var a,b,c,d,e,f,g,h;let i,j,k,{state:l,manager:m,options:n}=this,{dragOperation:o}=m,{position:p,source:q,status:r}=o;if(r.idle){l.current={},l.initial={};return}if(!q)return;let{element:s}=q,t=q.pluginConfig(gY),u=null!=(b=null!=(a=null==t?void 0:t.feedback)?a:null==n?void 0:n.feedback)?b:"default",v="function"==typeof u?u(q,m):u;if(!s||"none"===v||!r.initialized||r.initializing)return;let{initial:w}=l,y=null!=(c=this.overlay)?c:s,z=fV(y),A=fV(s),B=!gV(s,y),C=new f6(s,{frameTransform:B?A:null,ignoreTransforms:!B}),D={x:A.scaleX/z.scaleX,y:A.scaleY/z.scaleY},{width:E,height:F,top:G,left:H}=C;B&&(E/=D.x,F/=D.y);let I=new f8(y),J=fR(s),{transition:K,translate:L,boxSizing:M,paddingBlockStart:N,paddingBlockEnd:O,paddingInlineStart:P,paddingInlineEnd:Q,borderInlineStartWidth:R,borderInlineEndWidth:S,borderBlockStartWidth:T,borderBlockEndWidth:U}=J,V=K.split(",").filter(a=>!/^\s*(transform|translate|scale)\b/.test(a)).join(","),W=fX(J),X=J.transform,Y="clone"===v,Z="content-box"===M,$=Z?parseInt(P)+parseInt(Q)+parseInt(R)+parseInt(S):0,_=Z?parseInt(N)+parseInt(O)+parseInt(T)+parseInt(U):0,aa="move"===v||this.overlay?null:function(a,b="hidden"){return c_(()=>{let c,d,e,{element:f,manager:g}=a;if(!f||!g)return;let h=function(a,b){let c=new Map;for(let d of b)if(d.element&&(a===d.element||a.contains(d.element))){let a=`${gN}${gc("dom-id")}`;d.element.setAttribute(a,""),c.set(d,a)}return c}(f,g.registry.droppables),i=[],j=(c="input, textarea, select, canvas, [contenteditable]",d=f.cloneNode(!0),e=Array.from(f.querySelectorAll(c)),Array.from(d.querySelectorAll(c)).forEach((a,b)=>{let c=e[b];if(fw(a)&&fw(c)&&("file"!==a.type&&(a.value=c.value),"radio"===a.type&&a.name&&(a.name=`Cloned__${a.name}`)),fx(a)&&fx(c)&&c.width>0&&c.height>0){let b=a.getContext("2d");null==b||b.drawImage(c,0,0)}}),d),{remove:k}=j;return function(a,b,c){for(let[d,e]of a){if(!d.element)continue;let a=`[${e}]`,f=b.matches(a)?b:b.querySelector(a);if(d.element.removeAttribute(e),!f)continue;let g=d.element;d.proxy=f,f.removeAttribute(e),fy.set(g,f),c.push(()=>{fy.delete(g),d.proxy=void 0})}}(h,j,i),function(a,b="hidden"){a.setAttribute("inert","true"),a.setAttribute("tab-index","-1"),a.setAttribute("aria-hidden","true"),a.setAttribute(gR,b)}(j,b),j.remove=()=>{i.forEach(a=>a()),k.call(j)},j})}(q,Y?"clone":"hidden"),ab=c_(()=>ga(m.dragOperation.activatorEvent));if(!w.translate){if(this.overlay&&W)w.translate={x:W.x,y:W.y};else if("none"!==L){let a=fW(L);a&&(w.translate=a)}}if(!w.transformOrigin){let a=c_(()=>p.current),b=H+(null!=(d=null==W?void 0:W.x)?d:0),c=G+(null!=(e=null==W?void 0:W.y)?e:0);w.transformOrigin={x:(a.x-b*z.scaleX-z.x)/(E*z.scaleX),y:(a.y-c*z.scaleY-z.y)/(F*z.scaleY)}}let{transformOrigin:ac}=w,ad=G*z.scaleY+z.y,ae=H*z.scaleX+z.x;if(!w.coordinates&&(w.coordinates={x:ae,y:ad},1!==D.x||1!==D.y)){let{scaleX:a,scaleY:b}=A,{x:c,y:d}=ac;w.coordinates.x+=(E*a-E)*c,w.coordinates.y+=(F*b-F)*d}w.dimensions||(w.dimensions={width:E,height:F}),w.frameTransform||(w.frameTransform=z);let af={x:w.coordinates.x-ae,y:w.coordinates.y-ad},ag={width:(w.dimensions.width*w.frameTransform.scaleX-E*z.scaleX)*ac.x,height:(w.dimensions.height*w.frameTransform.scaleY-F*z.scaleY)*ac.y},ah={x:af.x/z.scaleX+ag.width,y:af.y/z.scaleY+ag.height},ai={left:H+ah.x,top:G+ah.y};y.setAttribute(gQ,"true");let aj=c_(()=>o.transform),ak=null!=(f=w.translate)?f:{x:0,y:0},al=aj.x*z.scaleX+ak.x,am=aj.y*z.scaleY+ak.y,an=fs();I.set({width:E-$,height:F-_,top:ai.top+an.y,left:ai.left+an.x,translate:`${al}px ${am}px 0`,transform:this.overlay?"none":X,transition:V?`${V}, translate 0ms linear`:"translate 0ms linear",scale:B?`${D.x} ${D.y}`:"","transform-origin":`${100*ac.x}% ${100*ac.y}%`},gP),aa&&(s.insertAdjacentElement("afterend",aa),(null==n?void 0:n.rootElement)&&("function"==typeof n.rootElement?n.rootElement(q):n.rootElement).appendChild(s)),fJ(y)&&(y.hasAttribute("popover")||y.setAttribute("popover","manual"),fK(y),y.addEventListener("beforetoggle",gW));let ao=(h={placeholder:aa,element:s,feedbackElement:y,frameTransform:z,transformOrigin:ac,width:E,height:F,top:G,left:H,widthOffset:$,heightOffset:_,delta:ah,styles:I,dragOperation:o,getTranslate:()=>l.current.translate,getElementMutationObserver:()=>i,getSavedCellWidths:()=>k,setSavedCellWidths:a=>{k=a}},new ResizeObserver(()=>{var a,b,c;let d=new f6(h.placeholder,{frameTransform:h.frameTransform,ignoreTransforms:!0}),e=null!=(a=h.transformOrigin)?a:{x:1,y:1},f=(h.width-d.width)*e.x+h.delta.x,g=(h.height-d.height)*e.y+h.delta.y,i=fs();if(h.styles.set({width:d.width-h.widthOffset,height:d.height-h.heightOffset,top:h.top+g+i.y,left:h.left+f+i.x},gP),null==(b=h.getElementMutationObserver())||b.takeRecords(),gX(h.element)&&gX(h.placeholder)){let a=Array.from(h.element.cells),b=Array.from(h.placeholder.cells);for(let[c,d]of(h.getSavedCellWidths()||h.setSavedCellWidths(a.map(a=>a.style.width)),a.entries())){let a=b[c];d.style.width=`${a.getBoundingClientRect().width}px`}}let j=null!=(c=h.getTranslate())?c:{x:0,y:0},k=h.left+f+i.x+j.x,l=h.top+g+i.y+j.y,m=d.width-h.widthOffset,n=d.height-h.heightOffset,o=h.frameTransform;h.dragOperation.shape=new d9(k*o.scaleX+o.x,l*o.scaleY+o.y,m*o.scaleX,n*o.scaleY)})),ap=new f6(y);c_(()=>o.shape=ap);let aq=fk(y),ar=a=>{this.manager.actions.stop({event:a})},as=fv(aq);if(ab&&aq.addEventListener("resize",ar),"idle"===c_(()=>q.status)&&requestAnimationFrame(()=>q.status="dragging"),aa){let a,b;ao.observe(aa),(a=new MutationObserver(a=>{let b=!1;for(let c of a){if(c.target!==s){b=!0;continue}if("attributes"!==c.type)continue;let a=c.attributeName;if(a.startsWith("aria-")||gS.includes(a))continue;let d=s.getAttribute(a);if("style"===a){if(f7(s)&&f7(aa)){let a=s.style;for(let b of Array.from(aa.style))""===a.getPropertyValue(b)&&aa.style.removeProperty(b);for(let b of Array.from(a)){if(gT.includes(b)||b.startsWith(gP))continue;let c=a.getPropertyValue(b);aa.style.setProperty(b,c)}}}else null!==d?aa.setAttribute(a,d):aa.removeAttribute(a)}b&&Y&&aa.replaceChildren(...s.cloneNode(!0).childNodes)})).observe(s,{attributes:!0,subtree:!0,childList:!0}),i=a,(b=new MutationObserver(a=>{for(let b of a)if(0!==b.addedNodes.length)for(let a of Array.from(b.addedNodes)){if(a.contains(s)&&s.nextElementSibling!==aa){s.insertAdjacentElement("afterend",aa),fK(y);return}if(a.contains(aa)&&aa.previousElementSibling!==s){aa.insertAdjacentElement("beforebegin",s),fK(y);return}}s.isConnected&&aa.isConnected&&s.nextElementSibling!==aa&&(s.insertAdjacentElement("afterend",aa),fK(y))})).observe(s.ownerDocument.body,{childList:!0,subtree:!0}),j=b}let at=null==(g=m.dragOperation.source)?void 0:g.id,au=()=>{var a;if(!ab||null==at)return;let b=m.registry.draggables.get(at),c=null!=(a=null==b?void 0:b.handle)?a:null==b?void 0:b.element;fm(c)&&c.focus()},av=()=>{var a;if(null==i||i.disconnect(),null==j||j.disconnect(),ao.disconnect(),aq.removeEventListener("resize",ar),fJ(y)&&(y.removeEventListener("beforetoggle",gW),y.removeAttribute("popover")),y.removeAttribute(gQ),I.reset(),k&&gX(s))for(let[b,c]of Array.from(s.cells).entries())c.style.width=null!=(a=k[b])?a:"";q.status="idle";let b=null!=l.current.translate,c=o.status.dragging;aa&&(!c&&b||aa.parentElement!==y.parentElement)&&y.isConnected&&aa.replaceWith(y),null==aa||aa.remove()},aw=null==n?void 0:n.dropAnimation,ax=this,ay=dL(()=>{var a,b,c;let{transform:d,status:e}=o;if((d.x||d.y||l.current.translate)&&e.dragging){let e=null!=(a=w.translate)?a:{x:0,y:0},f={x:d.x/z.scaleX+e.x,y:d.y/z.scaleY+e.y},g=l.current.translate,h=c_(()=>o.modifiers),j=c_(()=>{var a;return null==(a=o.shape)?void 0:a.current}),k=null==n?void 0:n.keyboardTransition,m=ab&&!as&&null!==k?`${null!=(b=null==k?void 0:k.duration)?b:250}ms ${null!=(c=null==k?void 0:k.easing)?c:"cubic-bezier(0.25, 1, 0.5, 1)"}`:"0ms linear";if(I.set({transition:V?`${V}, translate ${m}`:`translate ${m}`,translate:`${f.x}px ${f.y}px 0`},gP),null==i||i.takeRecords(),j&&j!==ap&&g&&!h.length){let a=d8.delta(f,g);o.shape=d9.from(j.boundingRectangle).translate(a.x*z.scaleX,a.y*z.scaleY)}else o.shape=new f6(y);l.current.translate=f}},function(){if(o.status.dropped){this.dispose(),q.status="dropping";let a=(null==t?void 0:t.dropAnimation)!==void 0?t.dropAnimation:void 0!==ax.dropAnimation?ax.dropAnimation:aw,b=l.current.translate,c=null!=b;if(b||s===y||(b={x:0,y:0}),!b||null===a)return void av();m.renderer.rendering.then(()=>{!function(a){var b,c,d,e;let{animation:f}=a;if("function"==typeof f)return Promise.resolve(f({source:a.source,element:a.element,feedbackElement:a.feedbackElement,placeholder:a.placeholder,translate:a.translate,moved:a.moved})).then(()=>{a.cleanup(),requestAnimationFrame(a.restoreFocus)});let{duration:g=250,easing:h="ease"}=null!=f?f:{};fK(a.feedbackElement);let[,i]=null!=(b=fg(a.feedbackElement,a=>"translate"in a))?b:[];null==i||i.pause();let j=null!=(c=a.placeholder)?c:a.element,k={frameTransform:gV(a.feedbackElement,j)?null:void 0},l=new f6(a.feedbackElement,k),m=null!=(d=fW(fR(a.feedbackElement).translate))?d:a.translate,n=new f6(j,k),o=d9.delta(l,n,a.alignment),p={x:m.x-o.x,y:m.y-o.y},q=Math.round(l.intrinsicHeight)!==Math.round(n.intrinsicHeight)?{minHeight:[`${l.intrinsicHeight}px`,`${n.intrinsicHeight}px`],maxHeight:[`${l.intrinsicHeight}px`,`${n.intrinsicHeight}px`]}:{},r=Math.round(l.intrinsicWidth)!==Math.round(n.intrinsicWidth)?{minWidth:[`${l.intrinsicWidth}px`,`${n.intrinsicWidth}px`],maxWidth:[`${l.intrinsicWidth}px`,`${n.intrinsicWidth}px`]}:{};a.styles.set({transition:a.transition},gP),a.feedbackElement.setAttribute(gO,""),null==(e=a.getElementMutationObserver())||e.takeRecords(),f1({element:a.feedbackElement,keyframes:gh(gq(gq({},q),r),gj({translate:[`${m.x}px ${m.y}px 0`,`${p.x}px ${p.y}px 0`]})),options:{duration:fv(fk(a.feedbackElement))?0:a.moved||a.feedbackElement!==a.element?g:0,easing:h}}).then(()=>{a.feedbackElement.removeAttribute(gO),null==i||i.finish(),a.cleanup(),requestAnimationFrame(a.restoreFocus)})}({source:q,element:s,feedbackElement:y,placeholder:aa,translate:b,moved:c,transition:K,alignment:q.alignment,styles:I,animation:null!=a?a:void 0,getElementMutationObserver:()=>i,cleanup:av,restoreFocus:au})})}});return()=>{av(),ay()}},gz(bE,4,"overlay",bC,gY,bF),gx(bE,gY),gY.configure=eH(gY),bL=[dI],bM=fY.Forward,bJ=[dI],bK=fY.Reverse;var gZ=class{constructor(){gD(this,bO,gy(bN,8,this,!0)),gy(bN,11,this),gD(this,bP,gy(bN,12,this,!0)),gy(bN,15,this)}isLocked(a){return a!==fY.Idle&&(null==a?!0===this[fY.Forward]&&!0===this[fY.Reverse]:!0===this[a])}unlock(a){a!==fY.Idle&&(this[a]=!1)}};bN=gt(null),bO=new WeakMap,bP=new WeakMap,gz(bN,4,bM,bL,gZ,bO),gz(bN,4,bK,bJ,gZ,bP),gx(bN,gZ);var g$=[fY.Forward,fY.Reverse],g_=class{constructor(){this.x=new gZ,this.y=new gZ}isLocked(){return this.x.isLocked()&&this.y.isLocked()}},g0=class extends eJ{constructor(a){super(a);const b=c8(new g_);let c=null;this.signal=b,dh(()=>{let{status:d}=a.dragOperation;if(!d.initialized){c=null,b.value=new g_;return}let{delta:e}=a.dragOperation.position;if(c){let a={x:g1(e.x,c.x),y:g1(e.y,c.y)},d=b.peek();c$(()=>{for(let b of ed)for(let c of g$)a[b]===c&&d[b].unlock(c);b.value=d})}c=e})}get current(){return this.signal.peek()}};function g1(a,b){return Math.sign(a-b)}var g2=class extends(bR=eK,bQ=[dI],bR){constructor(a){super(a),gD(this,bT,gy(bS,8,this,!1)),gy(bS,11,this),gD(this,bU),gD(this,bV,()=>{if(!gC(this,bU))return;let{element:a,by:b}=gC(this,bU);b.y&&(a.scrollTop+=b.y),b.x&&(a.scrollLeft+=b.x)}),this.scroll=(a,b)=>{var c;if(this.disabled)return!1;let d=this.getScrollableElements();if(!d)return gE(this,bU,void 0),!1;let{position:e}=this.manager.dragOperation,f=null==e?void 0:e.current;if(f){let{by:e}=null!=a?a:{},g=e?{x:g3(e.x),y:g3(e.y)}:void 0,h=g?void 0:this.scrollIntentTracker.current;if(null==h?void 0:h.isLocked())return!1;for(let a of d){let d=function(a,b){let{isTop:c,isBottom:d,isLeft:e,isRight:f,position:g}=fL(a),{x:h,y:i}=null!=b?b:{x:0,y:0},j=!c&&g.current.y+i>0,k=!d&&g.current.y+i<g.max.y,l=!e&&g.current.x+h>0,m=!f&&g.current.x+h<g.max.x;return{top:j,bottom:k,left:l,right:m,x:l||m,y:j||k}}(a,e);if(d.x||d.y){let{speed:d,direction:i}=function(a,b,c,d=25,e=fZ,f=f$){let{x:g,y:h}=b,{rect:i,isTop:j,isBottom:k,isLeft:l,isRight:m}=fL(a),n=fV(a),o=fX(fR(a,!0)),p=null!==o&&(null==o?void 0:o.scaleX)<0,q=null!==o&&(null==o?void 0:o.scaleY)<0,r=new d9(i.left*n.scaleX+n.x,i.top*n.scaleY+n.y,i.width*n.scaleX,i.height*n.scaleY),s={x:0,y:0},t={x:0,y:0},u={height:r.height*e.y,width:r.width*e.x};return u.height>0&&(!j||q&&!k)&&h<=r.top+u.height&&(null==c?void 0:c.y)!==1&&g>=r.left-f.x&&g<=r.right+f.x?(s.y=q?1:-1,t.y=d*Math.abs((r.top+u.height-h)/u.height)):u.height>0&&(!k||q&&!j)&&h>=r.bottom-u.height&&(null==c?void 0:c.y)!==-1&&g>=r.left-f.x&&g<=r.right+f.x&&(s.y=q?-1:1,t.y=d*Math.abs((r.bottom-u.height-h)/u.height)),u.width>0&&(!m||p&&!l)&&g>=r.right-u.width&&(null==c?void 0:c.x)!==-1&&h>=r.top-f.y&&h<=r.bottom+f.y?(s.x=p?-1:1,t.x=d*Math.abs((r.right-u.width-g)/u.width)):u.width>0&&(!l||p&&!m)&&g<=r.left+u.width&&(null==c?void 0:c.x)!==1&&h>=r.top-f.y&&h<=r.bottom+f.y&&(s.x=p?1:-1,t.x=d*Math.abs((r.left+u.width-g)/u.width)),{direction:s,speed:t}}(a,f,g,null==b?void 0:b.acceleration,null==b?void 0:b.threshold);if(h)for(let a of ed)h[a].isLocked(i[a])&&(d[a]=0,i[a]=0);if(i.x||i.y){let{x:b,y:f}=null!=e?e:i,g=b*d.x,h=f*d.y;if(g||h){let b=null==(c=gC(this,bU))?void 0:c.by;if(this.autoScrolling&&b&&(b.x&&!g||b.y&&!h))continue;return gE(this,bU,{element:a,by:{x:g,y:h}}),fN.schedule(gC(this,bV)),!0}}}}}return gE(this,bU,void 0),!1};let b=null,c=null;const d=dG(()=>{let{position:c,source:d}=a.dragOperation;if(!c)return null;let e=function a(b,{x:c,y:d}){var e;let f=b.elementFromPoint(c,d);if((null==(e=f)?void 0:e.tagName)==="IFRAME"){let{contentDocument:b}=f;if(b){let{left:e,top:g}=f.getBoundingClientRect();return a(b,{x:c-e,y:d-g})}}return f}(fu(null==d?void 0:d.element),c.current);return e&&(b=e),null!=e?e:b}),e=dG(()=>{let b=d.value,{documentElement:e}=fo(b);if(!b||b===e){let{target:b}=a.dragOperation,d=null==b?void 0:b.element;if(d){let a=fU(d,{excludeElement:!1});return c=a,a}}if(b){let a=fU(b,{excludeElement:!1});return this.autoScrolling&&c&&a.size<(null==c?void 0:c.size)?c:(c=a,a)}return c=null,null},dH);this.getScrollableElements=()=>e.value,this.scrollIntentTracker=new g0(a),this.destroy=a.monitor.addEventListener("dragmove",b=>{!this.disabled&&!b.defaultPrevented&&ga(a.dragOperation.activatorEvent)&&b.by&&this.scroll({by:b.by})&&b.preventDefault()})}};function g3(a){return a>0?fY.Forward:a<0?fY.Reverse:fY.Idle}bS=gt(bR),bT=new WeakMap,bU=new WeakMap,bV=new WeakMap,gz(bS,4,"autoScrolling",bQ,g2,bT),gx(bS,g2);var g4=new class{constructor(a){this.scheduler=a,this.pending=!1,this.tasks=new Set,this.resolvers=new Set,this.flush=()=>{let{tasks:a,resolvers:b}=this;for(let b of(this.pending=!1,this.tasks=new Set,this.resolvers=new Set,a))b();for(let a of b)a()}}schedule(a){return this.tasks.add(a),this.pending||(this.pending=!0,this.scheduler(this.flush)),new Promise(a=>this.resolvers.add(a))}}(a=>{"function"==typeof requestAnimationFrame?requestAnimationFrame(a):a()}),g5=class extends eJ{constructor(a,b){super(a,b);const c=a.registry.plugins.get(g2);if(!c)throw Error("AutoScroller plugin depends on Scroller plugin");this.destroy=dh(()=>{var b,d,e;if(this.disabled)return;let{position:f,status:g}=a.dragOperation;if(g.dragging){let a={acceleration:null==(b=this.options)?void 0:b.acceleration,threshold:"number"==typeof(null==(d=this.options)?void 0:d.threshold)?{x:this.options.threshold,y:this.options.threshold}:null==(e=this.options)?void 0:e.threshold};if(c.scroll(void 0,a)){c.autoScrolling=!0;let b=setInterval(()=>g4.schedule(()=>c.scroll(void 0,a)),10);return()=>{clearInterval(b)}}c.autoScrolling=!1}})}};g5.configure=eH(g5);var g6={capture:!0,passive:!0},g7=class extends eK{constructor(a){super(a),gD(this,bW),this.handleScroll=()=>{null==gC(this,bW)&&gE(this,bW,setTimeout(()=>{this.manager.collisionObserver.forceUpdate(!1),gE(this,bW,void 0)},50))};const{dragOperation:b}=this.manager;this.destroy=dh(()=>{var a,c,d;if(b.status.dragging){let e=null!=(d=null==(c=null==(a=b.source)?void 0:a.element)?void 0:c.ownerDocument)?d:document;return e.addEventListener("scroll",this.handleScroll,g6),()=>{e.removeEventListener("scroll",this.handleScroll,g6)}}})}};bW=new WeakMap;var g8=class extends eJ{constructor(a){super(a),this.manager=a;const b=a.registry.plugins.get(gL),c=null==b?void 0:b.register("* { user-select: none !important; -webkit-user-select: none !important; }");if(this.destroy=dh(()=>{let{dragOperation:a}=this.manager;if(a.status.initialized)return g9(),document.addEventListener("selectionchange",g9,{capture:!0}),()=>{document.removeEventListener("selectionchange",g9,{capture:!0})}}),c){const a=this.destroy.bind(this);this.destroy=()=>{c(),a()}}}};function g9(){var a;null==(a=document.getSelection())||a.removeAllRanges()}var ha=Object.freeze({offset:10,keyboardCodes:{start:["Space","Enter"],cancel:["Escape"],end:["Space","Enter","Tab"],up:["ArrowUp"],down:["ArrowDown"],left:["ArrowLeft"],right:["ArrowRight"]},preventActivation(a,b){var c;let d=null!=(c=b.handle)?c:b.element;return a.target!==d}}),hb=class extends e0{constructor(a,b){super(a),this.manager=a,this.options=b,gD(this,bX,[]),this.listeners=new fz,this.handleSourceKeyDown=(a,b,c)=>{if(this.disabled||a.defaultPrevented||!f9(a.target)||b.disabled)return;let{keyboardCodes:d=ha.keyboardCodes,preventActivation:e=ha.preventActivation}=null!=c?c:{};!d.start.includes(a.code)||!this.manager.dragOperation.status.idle||null!=e&&e(a,b)||this.handleStart(a,b,c)}}bind(a,b=this.options){return dh(()=>{var c;let d=null!=(c=a.handle)?c:a.element,e=c=>{ga(c)&&this.handleSourceKeyDown(c,a,b)};if(d)return d.addEventListener("keydown",e),()=>{d.removeEventListener("keydown",e)}})}handleStart(a,b,c){let{element:d}=b;if(!d)throw Error("Source draggable does not have an associated element");a.preventDefault(),a.stopImmediatePropagation(),f_(d);let{center:e}=new f6(d);if(this.manager.actions.start({event:a,coordinates:{x:e.x,y:e.y},source:b}).signal.aborted)return this.cleanup();this.sideEffects();let f=fo(d),g=[this.listeners.bind(f,[{type:"keydown",listener:a=>this.handleKeyDown(a,b,c),options:{capture:!0}}])];gC(this,bX).push(...g)}handleKeyDown(a,b,c){let{keyboardCodes:d=ha.keyboardCodes}=null!=c?c:{};if(hc(a,[...d.end,...d.cancel])){a.preventDefault();let b=hc(a,d.cancel);this.handleEnd(a,b);return}hc(a,d.up)?this.handleMove("up",a):hc(a,d.down)&&this.handleMove("down",a),hc(a,d.left)?this.handleMove("left",a):hc(a,d.right)&&this.handleMove("right",a)}handleEnd(a,b){this.manager.actions.stop({event:a,canceled:b}),this.cleanup()}handleMove(a,b){var c,d;let{shape:e}=this.manager.dragOperation,f=b.shiftKey?5:1,g={x:0,y:0},h=null!=(d=null==(c=this.options)?void 0:c.offset)?d:ha.offset;if("number"==typeof h&&(h={x:h,y:h}),e){switch(a){case"up":g={x:0,y:-h.y*f};break;case"down":g={x:0,y:h.y*f};break;case"left":g={x:-h.x*f,y:0};break;case"right":g={x:h.x*f,y:0}}(g.x||g.y)&&(b.preventDefault(),this.manager.actions.move({event:b,by:g}))}}sideEffects(){let a=this.manager.registry.plugins.get(g5);(null==a?void 0:a.disabled)===!1&&(a.disable(),gC(this,bX).push(()=>{a.enable()}))}cleanup(){gC(this,bX).forEach(a=>a()),gE(this,bX,[])}destroy(){this.cleanup(),this.listeners.clear()}};function hc(a,b){return b.includes(a.code)}bX=new WeakMap,hb.configure=eH(hb),hb.defaults=ha;var hd=class extends e2{constructor(){super(...arguments),gD(this,bY)}onEvent(a){switch(a.type){case"pointerdown":gE(this,bY,fq(a));break;case"pointermove":if(!gC(this,bY))return;let{x:b,y:c}=fq(a),d={x:b-gC(this,bY).x,y:c-gC(this,bY).y},{tolerance:e}=this.options;if(e&&eb(d,e))return void this.abort();eb(d,this.options.value)&&this.activate(a);break;case"pointerup":this.abort()}}abort(){gE(this,bY,void 0)}};bY=new WeakMap;var he=class extends e2{constructor(){super(...arguments),gD(this,bZ),gD(this,b$)}onEvent(a){switch(a.type){case"pointerdown":gE(this,b$,fq(a)),gE(this,bZ,setTimeout(()=>this.activate(a),this.options.value));break;case"pointermove":if(!gC(this,b$))return;let{x:b,y:c}=fq(a);eb({x:b-gC(this,b$).x,y:c-gC(this,b$).y},this.options.tolerance)&&this.abort();break;case"pointerup":this.abort()}}abort(){gC(this,bZ)&&(clearTimeout(gC(this,bZ)),gE(this,b$,void 0),gE(this,bZ,void 0))}};bZ=new WeakMap,b$=new WeakMap;var hf=class{};hf.Delay=he,hf.Distance=hd;var hg=Object.freeze({activationConstraints(a,b){var c;let{pointerType:d,target:e}=a;if(!("mouse"===d&&f9(e)&&(b.handle===e||(null==(c=b.handle)?void 0:c.contains(e)))))return"touch"===d?[new hf.Delay({value:250,tolerance:5})]:function(a){var b;if(!f9(a))return!1;let{tagName:c}=a;return"INPUT"===c||"TEXTAREA"===c||(b=a).hasAttribute("contenteditable")&&"false"!==b.getAttribute("contenteditable")}(e)&&!a.defaultPrevented?[new hf.Delay({value:200,tolerance:0})]:[new hf.Delay({value:200,tolerance:10}),new hf.Distance({value:5})]},preventActivation(a,b){var c;let{target:d}=a;return!(d===b.element||d===b.handle||!f9(d)||(null==(c=b.handle)?void 0:c.contains(d)))&&!!d.closest(`
      input:not([disabled]),
      select:not([disabled]),
      textarea:not([disabled]),
      button:not([disabled]),
      a[href],
      [contenteditable]:not([contenteditable="false"])
    `)}}),hh=class extends e0{constructor(a,b){super(a),this.manager=a,this.options=b,gD(this,b_,new Set),this.listeners=new fz,this.latest={event:void 0,coordinates:void 0},this.handleMove=()=>{let{event:a,coordinates:b}=this.latest;a&&b&&this.manager.actions.move({event:a,to:b})},this.handleCancel=this.handleCancel.bind(this),this.handlePointerUp=this.handlePointerUp.bind(this),this.handleKeyDown=this.handleKeyDown.bind(this)}activationConstraints(a,b,c=this.options){let{activationConstraints:d=hg.activationConstraints}=null!=c?c:{};return"function"==typeof d?d(a,b):d}bind(a,b=this.options){return dh(()=>{var c,d;let e=new AbortController,{signal:f}=e,g=c=>{(function(a){if(!a)return!1;let{PointerEvent:b}=fk(a.target);return a instanceof b})(c)&&this.handlePointerDown(c,a,b)},h=[null!=(c=a.handle)?c:a.element];for(let c of((null==b?void 0:b.activatorElements)&&(h=Array.isArray(b.activatorElements)?b.activatorElements:b.activatorElements(a)),h)){c&&(!(d=c.ownerDocument.defaultView)||hk.has(d)||(d.addEventListener("touchmove",hj,{capture:!1,passive:!1}),hk.add(d)),c.addEventListener("pointerdown",g,{signal:f}))}return()=>e.abort()})}handlePointerDown(a,b,c){if(this.disabled||!a.isPrimary||0!==a.button||!f9(a.target)||b.disabled||"sensor"in a||!this.manager.dragOperation.status.idle)return;let{preventActivation:d=hg.preventActivation}=null!=c?c:{};if(null==d?void 0:d(a,b))return;let{target:e}=a,f=fm(e)&&e.draggable&&"true"===e.getAttribute("draggable"),g=fV(b.element),{x:h,y:i}=fq(a);this.initialCoordinates={x:h*g.scaleX+g.x,y:i*g.scaleY+g.y};let j=this.activationConstraints(a,b,c);a.sensor=this;let k=new e1(j,a=>this.handleStart(b,a));k.signal.onabort=()=>this.handleCancel(a),k.onEvent(a),this.controller=k;let l=function a(b=document,c=new Set){if(c.has(b))return[];c.add(b);let d=[b];for(let e of Array.from(b.querySelectorAll("iframe, frame")))try{let b=e.contentDocument;b&&!c.has(b)&&d.push(...a(b,c))}catch(a){}try{let e=b.defaultView;if(e&&e!==window.top){let f=e.parent;f&&f.document&&f.document!==b&&d.push(...a(f.document,c))}}catch(a){}return d}(),m=this.listeners.bind(l,[{type:"pointermove",listener:a=>this.handlePointerMove(a,b)},{type:"pointerup",listener:this.handlePointerUp,options:{capture:!0}},{type:"pointercancel",listener:this.handleCancel},{type:"dragstart",listener:f?this.handleCancel:hi,options:{capture:!0}}]),n=()=>{m(),this.initialCoordinates=void 0};gC(this,b_).add(n)}handlePointerMove(a,b){var c,d;if((null==(c=this.controller)?void 0:c.activated)===!1){null==(d=this.controller)||d.onEvent(a);return}if(this.manager.dragOperation.status.dragging){let c=fq(a),d=fV(b.element);c.x=c.x*d.scaleX+d.x,c.y=c.y*d.scaleY+d.y,a.preventDefault(),a.stopPropagation(),this.latest.event=a,this.latest.coordinates=c,fN.schedule(this.handleMove)}}handlePointerUp(a){let{status:b}=this.manager.dragOperation;if(!b.idle){a.preventDefault(),a.stopPropagation();let c=!b.initialized;this.manager.actions.stop({event:a,canceled:c})}this.cleanup()}handleKeyDown(a){"Escape"===a.key&&(a.preventDefault(),this.handleCancel(a))}handleStart(a,b){let{manager:c,initialCoordinates:d}=this;if(!d||!c.dragOperation.status.idle||b.defaultPrevented)return;if(c.actions.start({coordinates:d,event:b,source:a}).signal.aborted)return this.cleanup();b.preventDefault();let e=fo(b.target).body;try{e.setPointerCapture(b.pointerId)}catch(a){this.handleCancel(b);return}let f=f9(b.target)?[b.target,e]:e,g=this.listeners.bind(f,[{type:"touchmove",listener:hi,options:{passive:!1}},{type:"click",listener:hi},{type:"contextmenu",listener:hi},{type:"keydown",listener:this.handleKeyDown}]);gC(this,b_).add(g)}handleCancel(a){let{dragOperation:b}=this.manager;b.status.initialized&&this.manager.actions.stop({event:a,canceled:!0}),this.cleanup()}cleanup(){let{controller:a}=this;this.controller=void 0,a&&!a.signal.aborted&&a.abort(),this.latest={event:void 0,coordinates:void 0},gC(this,b_).forEach(a=>a()),gC(this,b_).clear()}destroy(){this.cleanup(),this.listeners.clear()}};function hi(a){a.preventDefault()}function hj(){}b_=new WeakMap,hh.configure=eH(hh),hh.defaults=hg;var hk=new WeakSet,hl=[],hm=[gJ,g5,gM,gY,g8],hn=[hh,hb],ho=class extends e8{constructor(a={}){const b=e7(a.plugins,hm),c=e7(a.sensors,hn),d=e7(a.modifiers,hl);super(((a,b)=>gh(a,gj(b)))(gq({},a),{plugins:[g7,g2,gL,...b],sensors:c,modifiers:d}))}},hp=class extends(b2=eS,b1=[dI],b0=[dI],b2){constructor(a,b){var{element:c,effects:d=()=>[],handle:e}=a;super(gq({effects:()=>[...d(),()=>{var a,b;let{manager:c}=this;if(!c)return;let d=(null!=(b=null==(a=this.sensors)?void 0:a.map(eI))?b:[...c.sensors]).map(a=>{let b=a instanceof e0?a:c.registry.register(a.plugin),d=a instanceof e0?void 0:a.options;return b.bind(this,d)});return function(){d.forEach(a=>a())}}]},gs(a,["element","effects","handle"])),b),gD(this,b4,gy(b3,8,this)),gy(b3,11,this),gD(this,b5,gy(b3,12,this)),gy(b3,15,this),this.element=c,this.handle=e}};b3=gt(b2),b4=new WeakMap,b5=new WeakMap,gz(b3,4,"handle",b1,hp,b4),gz(b3,4,"element",b0,hp,b5),gx(b3,hp);var hq=class extends(b8=eT,b7=[dI],b6=[dI],b8){constructor(a,b){var{element:c,effects:d=()=>[]}=a,e=gs(a,["element","effects"]);const{collisionDetector:f=gd}=e,g=a=>{let{manager:b,element:c}=this;if(!c||null===a){this.shape=void 0;return}if(!b)return;let d=new f6(c),e=c_(()=>this.shape);return d&&(null==e?void 0:e.equals(d))?e:(this.shape=d,d)},h=c8(!1);super(((a,b)=>gh(a,gj(b)))(gq({},e),{collisionDetector:f,effects:()=>[...d(),()=>{let{element:a,manager:b}=this;if(!b)return;let{dragOperation:c}=b,{source:d}=c;h.value=!!(d&&c.status.initialized&&a&&!this.disabled&&this.accepts(d))},()=>{let{element:a}=this;if(h.value&&a){let b=new fI(a,g);return()=>{b.disconnect(),this.shape=void 0}}},()=>{var a;if(null==(a=this.manager)?void 0:a.dragOperation.status.initialized)return()=>{this.shape=void 0}}]}),b),gD(this,ce),gD(this,ca,gy(b9,8,this)),gy(b9,11,this),gD(this,cf,gy(b9,12,this)),gy(b9,15,this),this.element=c,this.refreshShape=()=>g()}set element(a){gE(this,ce,a,cd)}get element(){var a;return null!=(a=this.proxy)?a:gC(this,ce,cc)}};b9=gt(b8),ca=new WeakMap,ce=new WeakSet,cf=new WeakMap,cc=(cb=gz(b9,20,"#element",b7,ce,ca)).get,cd=cb.set,gz(b9,4,"proxy",b6,hq,cf),gx(b9,hq);var hr=a.i(935112);function hs(a){var b;if(null!=a)return null!=a&&"object"==typeof a&&"current"in a?null!=(b=a.current)?b:void 0:a}var ht=cv.useEffect;function hu(a,b){let c,d=(0,cv.useRef)(new Map),e=(c=(0,cv.useState)(0)[1],(0,cv.useCallback)(()=>{c(a=>a+1)},[c]));return ht(()=>a?dh(()=>{var c;let f=!1,g=!1;for(let e of d.current){let[h]=e,i=c_(()=>e[1]),j=a[h];i!==j&&(f=!0,d.current.set(h,j),g=null!=(c=null==b?void 0:b(h,i,j))&&c)}f&&(g?queueMicrotask(()=>(0,hr.flushSync)(e)):e())}):void d.current.clear(),[a]),(0,cv.useMemo)(()=>a?new Proxy(a,{get(a,b){let c=a[b];return d.current.set(b,c),c}}):a,[a])}function hv(a,b){a()}function hw(a){let b=(0,cv.useRef)(a);return ht(()=>{b.current=a},[a]),b}function hx(a,b,c=cv.useEffect,d=Object.is){let e=(0,cv.useRef)(a);c(()=>{let c=e.current;d(a,c)||(e.current=a,b(a,c))},[b,a])}function hy(a,b){let c=(0,cv.useRef)(hs(a));ht(()=>{let d=hs(a);d!==c.current&&(c.current=d,b(d))})}var hz=Object.defineProperty,hA=Object.defineProperties,hB=Object.getOwnPropertyDescriptors,hC=Object.getOwnPropertySymbols,hD=Object.prototype.hasOwnProperty,hE=Object.prototype.propertyIsEnumerable,hF=(a,b,c)=>b in a?hz(a,b,{enumerable:!0,configurable:!0,writable:!0,value:c}):a[b]=c,hG=(a,b)=>{for(var c in b||(b={}))hD.call(b,c)&&hF(a,c,b[c]);if(hC)for(var c of hC(b))hE.call(b,c)&&hF(a,c,b[c]);return a},hH=new ho,hI=(0,cv.createContext)(hH),hJ=(0,cv.memo)((0,cv.forwardRef)(({children:a},b)=>{let[c,d]=(0,cv.useState)(0),e=(0,cv.useRef)(null),f=(0,cv.useRef)(null),g=(0,cv.useMemo)(()=>({renderer:{get rendering(){var a;return null!=(a=e.current)?a:Promise.resolve()}},trackRendering(a){e.current||(e.current=new Promise(a=>{f.current=a})),(0,cv.startTransition)(()=>{a(),d(a=>a+1)})}}),[]);return ht(()=>{var a;null==(a=f.current)||a.call(f),e.current=null},[a,c]),(0,cv.useImperativeHandle)(b,()=>g),null})),hK=[void 0,dH];function hL(a){let b;var c,{children:d,onCollision:e,onBeforeDragStart:f,onDragStart:g,onDragMove:h,onDragOver:i,onDragEnd:j}=a,k=((a,b)=>{var c={};for(var d in a)hD.call(a,d)&&0>b.indexOf(d)&&(c[d]=a[d]);if(null!=a&&hC)for(var d of hC(a))0>b.indexOf(d)&&hE.call(a,d)&&(c[d]=a[d]);return c})(a,["children","onCollision","onBeforeDragStart","onDragStart","onDragMove","onDragOver","onDragEnd"]);let l=(0,cv.useRef)(null),{plugins:m,modifiers:n,sensors:o}=k,p=e7(m,hm),q=e7(o,hn),r=e7(n,hl),s=hw(f),t=hw(g),u=hw(i),v=hw(h),w=hw(j),y=hw(e),z=(c=()=>{var a;return null!=(a=k.manager)?a:new ho(k)},(b=(0,cv.useRef)(null)).current||(b.current=c()),(0,cv.useInsertionEffect)(()=>()=>{var a;return null==(a=b.current)?void 0:a.destroy()},[]),b.current);return(0,cv.useEffect)(()=>{if(!l.current)throw Error("Renderer not found");let{renderer:a,trackRendering:b}=l.current,{monitor:c}=z;z.renderer=a;let d=[c.addEventListener("beforedragstart",a=>{let c=s.current;c&&b(()=>c(a,z))}),c.addEventListener("dragstart",a=>{var b;return null==(b=t.current)?void 0:b.call(t,a,z)}),c.addEventListener("dragover",a=>{let c=u.current;c&&b(()=>c(a,z))}),c.addEventListener("dragmove",a=>{let c=v.current;c&&b(()=>c(a,z))}),c.addEventListener("dragend",a=>{let c=w.current;c&&b(()=>c(a,z))}),c.addEventListener("collision",a=>{var b;return null==(b=y.current)?void 0:b.call(y,a,z)})];return()=>d.forEach(a=>a())},[z]),hx(p,()=>z&&(z.plugins=p),...hK),hx(q,()=>z&&(z.sensors=q),...hK),hx(r,()=>z&&(z.modifiers=r),...hK),(0,ct.jsxs)(hI.Provider,{value:z,children:[(0,ct.jsx)(hJ,{ref:l,children:d}),d]})}function hM(){return(0,cv.useContext)(hI)}function hN(a){var b;let c=null!=(b=hM())?b:void 0,[d]=(0,cv.useState)(()=>a(c));return d.manager!==c&&(d.manager=c),ht(d.register,[c,d]),d}function hO(a,b,c){return"isDragSource"===a&&!c&&!!b}var hP=Object.create,hQ=Object.defineProperty,hR=Object.getOwnPropertyDescriptor,hS=(a,b)=>(b=Symbol[a])?b:Symbol.for("Symbol."+a),hT=a=>{throw TypeError(a)},hU=["class","method","getter","setter","accessor","field","value","get","set"],hV=a=>void 0!==a&&"function"!=typeof a?hT("Function expected"):a,hW=(a,b,c,d,e)=>({kind:hU[a],name:b,metadata:d,addInitializer:a=>c._?hT("Already initialized"):e.push(hV(a||null))}),hX=(a,b,c,d,e,f)=>{for(var g,h,i,j=7&b,k=hU[j+5],l=a[2]||(a[2]=[]),m=hR(e=e.prototype,c),n=d.length-1;n>=0;n--)(i=hW(j,c,h={},a[3],l)).static=!1,i.private=!1,(i.access={has:a=>c in a}).get=a=>a[c],g=(0,d[n])(m[k],i),h._=1,hV(g)&&(m[k]=g);return m&&hQ(e,c,m),e},hY=(a,b,c)=>b.has(a)||hT("Cannot "+c),hZ=class a{constructor(a,b){this.x=a,this.y=b}static delta(b,c){return new a(b.x-c.x,b.y-c.y)}static distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}static equals(a,b){return a.x===b.x&&a.y===b.y}static from({x:b,y:c}){return new a(b,c)}},h$=class extends(ci=dM,ch=[dJ],cg=[dJ],ci){constructor(a){super(hZ.from(a),(a,b)=>hZ.equals(a,b)),((a,b)=>{for(var c=0,d=a[2],e=d&&d.length;c<e;c++)d[c].call(b)})(ck,this),((a,b)=>b.has(a)?hT("Cannot add the same private member more than once"):b instanceof WeakSet?b.add(a):b.set(a,0))(this,cj),this.velocity={x:0,y:0}}get delta(){return hZ.delta(this.current,this.initial)}get direction(){let{current:a,previous:b}=this;if(!b)return null;let c={x:a.x-b.x,y:a.y-b.y};return c.x||c.y?Math.abs(c.x)>Math.abs(c.y)?c.x>0?"right":"left":c.y>0?"down":"up":null}get current(){return super.current}set current(a){let b,{current:c}=this,d=hZ.from(a),e={x:d.x-c.x,y:d.y-c.y},f=Date.now(),g=f-(hY(this,b=cj,"read from private field"),b.get(this)),h=a=>Math.round(a/g*100);c$(()=>{let a;hY(this,a=cj,"write to private field"),a.set(this,f),this.velocity={x:h(e.x),y:h(e.y)},super.current=d})}reset(a=this.defaultValue){super.reset(hZ.from(a)),this.velocity={x:0,y:0}}};ck=[,,,hP(null!=(p=null==ci?void 0:ci[hS("metadata")])?p:null)],cj=new WeakMap,hX(ck,2,"delta",ch,h$),hX(ck,2,"direction",cg,h$),q=ck,f=hS("metadata"),g=q[3],f in h$?hQ(h$,f,{enumerable:!0,configurable:!0,writable:!0,value:g}):h$[f]=g;var h_=((r=h_||{}).Horizontal="x",r.Vertical="y",r);Object.values(h_);var h0=a=>{var b;return null!=(b=(({dragOperation:a,droppable:b})=>{let c=a.position.current;if(!c)return null;let{id:d}=b;return b.shape&&b.shape.containsPoint(c)?{id:d,value:1/hZ.distance(b.shape.center,c),type:eZ.PointerIntersection,priority:eY.High}:null})(a))?b:(({dragOperation:a,droppable:b})=>{let{shape:c}=a;if(!b.shape||!(null==c?void 0:c.current))return null;let d=c.current.intersectionArea(b.shape);if(d){let{position:e}=a,f=hZ.distance(b.shape.center,e.current),g=d/(c.current.area+b.shape.area-d);return{id:b.id,value:g/f,type:eZ.ShapeIntersection,priority:eY.Normal}}return null})(a)};function h1(a){let{collisionDetector:b,data:c,disabled:d,element:e,id:f,accept:g,type:h}=a,i=hN(b=>new hq(hA(hG({},a),hB({register:!1,element:hs(e)})),b)),j=hu(i);return hx(f,()=>i.id=f),hy(e,a=>i.element=a),hx(g,()=>i.accept=g,void 0,dH),hx(b,()=>i.collisionDetector=null!=b?b:h0),hx(c,()=>c&&(i.data=c)),hx(d,()=>i.disabled=!0===d),hx(h,()=>i.type=h),{droppable:j,get isDropTarget(){return j.isDropTarget},ref:(0,cv.useCallback)(a=>{var b,c;(a||null==(b=i.element)||!b.isConnected||(null==(c=i.manager)?void 0:c.dragOperation.status.idle))&&(i.element=null!=a?a:void 0)},[i])}}var h2=Object.create,h3=Object.defineProperty,h4=Object.defineProperties,h5=Object.getOwnPropertyDescriptor,h6=Object.getOwnPropertyDescriptors,h7=Object.getOwnPropertySymbols,h8=Object.prototype.hasOwnProperty,h9=Object.prototype.propertyIsEnumerable,ia=a=>{throw TypeError(a)},ib=(a,b,c)=>b in a?h3(a,b,{enumerable:!0,configurable:!0,writable:!0,value:c}):a[b]=c,ic=(a,b)=>{for(var c in b||(b={}))h8.call(b,c)&&ib(a,c,b[c]);if(h7)for(var c of h7(b))h9.call(b,c)&&ib(a,c,b[c]);return a},id=["class","method","getter","setter","accessor","field","value","get","set"],ie=a=>void 0!==a&&"function"!=typeof a?ia("Function expected"):a,ig=(a,b,c,d,e)=>({kind:id[a],name:b,metadata:d,addInitializer:a=>c._?ia("Already initialized"):e.push(ie(a||null))}),ih=(a,b,c,d)=>{for(var e=0,f=a[b>>1],g=f&&f.length;e<g;e++)1&b?f[e].call(c):d=f[e].call(c,d);return d},ii=(a,b,c,d,e,f)=>{for(var g,h,i,j,k,l=7&b,m=a.length+1,n=id[l+5],o=a[m-1]=[],p=a[m]||(a[m]=[]),q=(e=e.prototype,h5({get[c](){return ik(this,f)},set[c](x){return im(this,f,x)}},c)),r=d.length-1;r>=0;r--)(j=ig(l,c,i={},a[3],p)).static=!1,j.private=!1,(k=j.access={has:a=>c in a}).get=a=>a[c],k.set=(a,b)=>a[c]=b,h=(0,d[r])({get:q.get,set:q.set},j),i._=1,void 0===h?ie(h)&&(q[n]=h):"object"!=typeof h||null===h?ia("Object expected"):(ie(g=h.get)&&(q.get=g),ie(g=h.set)&&(q.set=g),ie(g=h.init)&&o.unshift(g));return q&&h3(e,c,q),e},ij=(a,b,c)=>b.has(a)||ia("Cannot "+c),ik=(a,b,c)=>(ij(a,b,"read from private field"),b.get(a)),il=(a,b,c)=>b.has(a)?ia("Cannot add the same private member more than once"):b instanceof WeakSet?b.add(a):b.set(a,c),im=(a,b,c,d)=>(ij(a,b,"write to private field"),b.set(a,c),c);function io(a){return a instanceof iJ||a instanceof iI}var ip=class extends eJ{constructor(a){super(a);const b=dh(()=>{let{dragOperation:b}=a;if(ga(b.activatorEvent)&&io(b.source)&&b.status.initialized){let b=a.registry.plugins.get(g2);if(b)return b.disable(),()=>b.enable()}}),c=a.monitor.addEventListener("dragmove",(a,b)=>{queueMicrotask(()=>{if(this.disabled||a.defaultPrevented||!a.nativeEvent)return;let{dragOperation:c}=b;if(!ga(a.nativeEvent)||!io(c.source)||!c.shape)return;let{actions:d,collisionObserver:e,registry:f}=b,{by:g}=a;if(!g)return;let h=function(a){let{x:b,y:c}=a;return b>0?"right":b<0?"left":c>0?"down":c<0?"up":void 0}(g),{source:i,target:j}=c,{center:k}=c.shape.current,l=[],m=[];c$(()=>{for(let a of f.droppables){let{id:b}=a;if(!a.accepts(i)||b===(null==j?void 0:j.id)&&io(a)||!a.element)continue;let c=a.shape,d=new f6(a.element,{getBoundingClientRect:a=>fp(a,void 0,.2)});d.height&&d.width&&("down"==h&&k.y+10<d.center.y||"up"==h&&k.y-10>d.center.y||"left"==h&&k.x-10>d.center.x||"right"==h&&k.x+10<d.center.x)&&(l.push(a),a.shape=d,m.push(()=>a.shape=c))}}),a.preventDefault(),e.disable();let n=e.computeCollisions(l,ge);c$(()=>m.forEach(a=>a()));let[o]=n;if(!o)return;let{id:p}=o,{index:q,group:r}=i.sortable;d.setDropTarget(p).then(()=>{let{source:a,target:b,shape:f}=c;if(!a||!io(a)||!f)return;let{index:g,group:h,target:i}=a.sortable,j=q!==g||r!==h,k=j?i:null==b?void 0:b.element;if(!k)return;f_(k);let l=new f6(k);if(!l)return;let m=d9.delta(l,d9.from(f.current.boundingRectangle),a.alignment);d.move({by:m}),j?d.setDropTarget(a.id).then(()=>e.enable()):e.enable()})})});this.destroy=()=>{c(),b()}}},iq=Object.defineProperty,ir=Object.defineProperties,is=Object.getOwnPropertyDescriptors,it=Object.getOwnPropertySymbols,iu=Object.prototype.hasOwnProperty,iv=Object.prototype.propertyIsEnumerable,iw=(a,b,c)=>b in a?iq(a,b,{enumerable:!0,configurable:!0,writable:!0,value:c}):a[b]=c,ix=(a,b)=>{for(var c in b||(b={}))iu.call(b,c)&&iw(a,c,b[c]);if(it)for(var c of it(b))iv.call(b,c)&&iw(a,c,b[c]);return a};function iy(a,b,c){if(b===c)return a;let d=a.slice();return d.splice(c,0,d.splice(b,1)[0]),d}function iz(a){return"initialIndex"in a&&"number"==typeof a.initialIndex&&"index"in a&&"number"==typeof a.index}var iA="__default__";function iB(a,b,c,d){c.insertAdjacentElement(d<b?"afterend":"beforebegin",a)}function iC(a,b){return a.index-b.index}function iD(a){return Array.from(a).sort(iC)}var iE=[ip,class extends eJ{constructor(a){super(a);const b=()=>{let b=new Map;for(let c of a.registry.droppables)if(c instanceof iJ){let{sortable:a}=c,{group:d}=a,e=b.get(d);e||(e=new Set,b.set(d,e)),e.add(a)}for(let[a,c]of b)b.set(a,new Set(iD(c)));return b},c=[a.monitor.addEventListener("dragover",(a,c)=>{if(this.disabled)return;let{dragOperation:d}=c,{source:e,target:f}=d;if(!io(e)||!io(f)||e.sortable===f.sortable)return;let g=b(),h=e.sortable.group===f.sortable.group,i=g.get(e.sortable.group),j=h?i:g.get(f.sortable.group);i&&j&&queueMicrotask(()=>{a.defaultPrevented||c.renderer.rendering.then(()=>{var d,k,l;let m=b();for(let[a,b]of g.entries())for(let[c,e]of Array.from(b).entries())if(e.index!==c||e.group!==a||!(null==(d=m.get(a))?void 0:d.has(e)))return;let n=e.sortable.element,o=f.sortable.element;if(!o||!n||!h&&f.id===e.sortable.group)return;let p=iD(i),q=h?p:iD(j),r=null!=(k=e.sortable.group)?k:iA,s=null!=(l=f.sortable.group)?l:iA,t={[r]:p,[s]:q},u=function(a,b,c){var d,e,f;let g,h,{source:i,target:j,canceled:k}=b.operation;if(!i||!j||k)return"preventDefault"in b&&b.preventDefault(),a;let l=(a,b)=>a===b||"object"==typeof a&&"id"in a&&a.id===b;if(Array.isArray(a)){let d=a.findIndex(a=>l(a,i.id)),e=a.findIndex(a=>l(a,j.id));if(-1===d||-1===e){if(iz(i)){let d=i.initialIndex,e=i.index;return d===e||d<0||d>=a.length?("preventDefault"in b&&b.preventDefault(),a):c(a,d,e)}return a}if(!k&&"index"in i&&"number"==typeof i.index){let b=i.index;if(b!==d)return c(a,d,b)}return c(a,d,e)}let m=Object.entries(a),n=-1,o=-1;for(let[a,b]of m)if(-1===n&&-1!==(n=b.findIndex(a=>l(a,i.id)))&&(g=a),-1===o&&-1!==(o=b.findIndex(a=>l(a,j.id)))&&(h=a),-1!==n&&-1!==o)break;if(-1===n&&iz(i)){let d=i.initialGroup,e=i.initialIndex,f=i.group,g=i.index;if(null==d||null==f||!(d in a)||!(f in a)||d===f&&e===g)return"preventDefault"in b&&b.preventDefault(),a;if(d===f)return ir(ix({},a),is({[d]:c(a[d],e,g)}));let h=a[d][e];return ir(ix({},a),is({[d]:[...a[d].slice(0,e),...a[d].slice(e+1)],[f]:[...a[f].slice(0,g),h,...a[f].slice(g)]}))}if(!i.manager)return a;let{dragOperation:p}=i.manager,q=null!=(e=null==(d=p.shape)?void 0:d.current.center)?e:p.position.current;if(null==h&&j.id in a){let b=j.shape&&q.y>j.shape.center.y?a[j.id].length:0;h=j.id,o=b}if(null==g||null==h||g===h&&n===o){if(null!=g&&g===h&&n===o&&iz(i)){let b=null!=i.group&&i.group!==g,d=i.index!==n;if(b||d){let b=null!=(f=i.group)?f:g;if(b in a){if(g===b)return ir(ix({},a),is({[g]:c(a[g],n,i.index)}));let d=a[g][n];return ir(ix({},a),is({[g]:[...a[g].slice(0,n),...a[g].slice(n+1)],[b]:[...a[b].slice(0,i.index),d,...a[b].slice(i.index)]}))}}}return"preventDefault"in b&&b.preventDefault(),a}if(g===h)return ir(ix({},a),is({[g]:c(a[g],n,o)}));let r=+!!(j.shape&&Math.round(q.y)>Math.round(j.shape.center.y)),s=a[g][n];return ir(ix({},a),is({[g]:[...a[g].slice(0,n),...a[g].slice(n+1)],[h]:[...a[h].slice(0,o+r),s,...a[h].slice(o+r)]}))}(t,a,iy);if(t===u)return;let v=u[s].indexOf(e.sortable),w=u[s].indexOf(f.sortable);c.collisionObserver.disable(),iB(n,v,o,w),c$(()=>{for(let[a,b]of u[r].entries())b.index=a;if(!h)for(let[a,b]of u[s].entries())b.group=f.sortable.group,b.index=a}),c.actions.setDropTarget(e.id).then(()=>c.collisionObserver.enable())})})}),a.monitor.addEventListener("dragend",(a,c)=>{if(!a.canceled)return;let{dragOperation:d}=c,{source:e}=d;io(e)&&(e.sortable.initialIndex!==e.sortable.index||e.sortable.initialGroup!==e.sortable.group)&&queueMicrotask(()=>{let a=b(),d=a.get(e.sortable.initialGroup);d&&c.renderer.rendering.then(()=>{for(let[b,c]of a.entries())for(let[a,d]of Array.from(c).entries())if(d.index!==a||d.group!==b)return;let b=iD(d),c=e.sortable.element,f=b[e.sortable.initialIndex],g=null==f?void 0:f.element;f&&g&&c&&(iB(c,f.index,g,e.index),c$(()=>{for(let[b,c]of a.entries())for(let a of Array.from(c).values())a.index=a.initialIndex,a.group=a.initialGroup}))})})})];this.destroy=()=>{for(let a of c)a()}}}],iF={duration:250,easing:"cubic-bezier(0.25, 1, 0.5, 1)",idle:!1},iG=new dO;cm=[dI],cl=[dI];var iH=class{constructor(a,b){il(this,co,ih(cn,8,this)),ih(cn,11,this),il(this,cp),il(this,cq),il(this,cr,ih(cn,12,this)),ih(cn,15,this),il(this,cs),this.register=()=>(c$(()=>{var a,b;null==(a=this.manager)||a.registry.register(this.droppable),null==(b=this.manager)||b.registry.register(this.draggable)}),()=>this.unregister()),this.unregister=()=>{c$(()=>{var a,b;null==(a=this.manager)||a.registry.unregister(this.droppable),null==(b=this.manager)||b.registry.unregister(this.draggable)})},this.destroy=()=>{c$(()=>{this.droppable.destroy(),this.draggable.destroy()})};var{effects:c=()=>[],group:d,index:e,sensors:f,type:g,transition:h=iF,plugins:i}=a,j=((a,b)=>{var c={};for(var d in a)h8.call(a,d)&&0>b.indexOf(d)&&(c[d]=a[d]);if(null!=a&&h7)for(var d of h7(a))0>b.indexOf(d)&&h9.call(a,d)&&(c[d]=a[d]);return c})(a,["effects","group","index","sensors","type","transition","plugins"]);const k=e7(i,iE);this.droppable=new iJ(j,b,this),this.draggable=new iI(((a,b)=>h4(a,h6(b)))(ic({},j),{plugins:k,effects:()=>[()=>{var a,b,c;let d=null==(a=this.manager)?void 0:a.dragOperation.status;(null==d?void 0:d.initializing)&&this.id===(null==(c=null==(b=this.manager)?void 0:b.dragOperation.source)?void 0:c.id)&&iG.clear(this.manager),(null==d?void 0:d.dragging)&&iG.set(this.manager,this.id,c_(()=>({initialIndex:this.index,initialGroup:this.group})))},()=>{let{index:a,group:b,manager:c}=this,d=ik(this,cq),e=ik(this,cp);(a!==d||b!==e)&&(im(this,cq,a),im(this,cp,b),this.animate())},()=>{var a,b;let{target:c}=this,{isDragSource:d}=this.draggable;"move"===(null!=(b=null==(a=this.draggable.pluginConfig(gY))?void 0:a.feedback)?b:"default")&&d&&(this.droppable.disabled=!c)},...c()],type:g,sensors:f}),b,this),im(this,cs,j.element),this.manager=b,this.index=e,im(this,cq,e),this.group=d,im(this,cp,d),this.type=g,this.transition=h}get initialIndex(){var a,b;return null!=(b=null==(a=iG.get(this.manager,this.id))?void 0:a.initialIndex)?b:this.index}get initialGroup(){var a,b;return null!=(b=null==(a=iG.get(this.manager,this.id))?void 0:a.initialGroup)?b:this.group}animate(){c_(()=>{let{manager:a,transition:b}=this,{shape:c}=this.droppable;if(!a)return;let{idle:d}=a.dragOperation.status;c&&b&&(!d||b.idle)&&a.renderer.rendering.then(()=>{let{element:d}=this;if(!d)return;for(let a of d.getAnimations())"transitionProperty"in a&&("transform"===a.transitionProperty||"translate"===a.transitionProperty||"scale"===a.transitionProperty)&&a.cancel();let e=this.refreshShape();if(!e)return;let f={x:c.boundingRectangle.left-e.boundingRectangle.left,y:c.boundingRectangle.top-e.boundingRectangle.top},{translate:g}=fR(d),h=f2(d,g,!1),i=f2(d,g);if(f.x||f.y){let c=fv(fk(d))?h4(ic({},b),h6({duration:0})):b;f1({element:d,keyframes:{translate:[`${h.x+f.x}px ${h.y+f.y}px ${h.z}`,`${i.x}px ${i.y}px ${i.z}`]},options:c}).then(()=>{a.dragOperation.status.dragging||(this.droppable.shape=void 0)})}})})}get manager(){return this.draggable.manager}set manager(a){c$(()=>{this.draggable.manager=a,this.droppable.manager=a})}set element(a){c$(()=>{let b=ik(this,cs),c=this.droppable.element,d=this.draggable.element;c&&c!==b||(this.droppable.element=a),d&&d!==b||(this.draggable.element=a),im(this,cs,a)})}get element(){var a,b;let c=ik(this,cs);if(c)return null!=(b=null!=(a=fy.get(c))?a:c)?b:this.droppable.element}set target(a){this.droppable.element=a}get target(){return this.droppable.element}set source(a){this.draggable.element=a}get source(){return this.draggable.element}get disabled(){return this.draggable.disabled&&this.droppable.disabled}set plugins(a){this.draggable.plugins=e7(a,iE)}set disabled(a){c$(()=>{this.droppable.disabled=a,this.draggable.disabled=a})}set data(a){c$(()=>{this.droppable.data=a,this.draggable.data=a})}set handle(a){this.draggable.handle=a}set id(a){this.droppable.id=a,this.draggable.id=a}get id(){return this.droppable.id}set sensors(a){this.draggable.sensors=a}set modifiers(a){this.draggable.modifiers=a}set collisionPriority(a){this.droppable.collisionPriority=a}set collisionDetector(a){this.droppable.collisionDetector=null!=a?a:gd}set alignment(a){this.draggable.alignment=a}get alignment(){return this.draggable.alignment}set type(a){c$(()=>{this.droppable.type=a,this.draggable.type=a})}get type(){return this.draggable.type}set accept(a){this.droppable.accept=a}get accept(){return this.droppable.accept}get isDropTarget(){return this.droppable.isDropTarget}get isDragSource(){return this.draggable.isDragSource}get isDragging(){return this.draggable.isDragging}get isDropping(){return this.draggable.isDropping}get status(){return this.draggable.status}refreshShape(){return this.droppable.refreshShape()}accepts(a){return this.droppable.accepts(a)}};cn=[,,,h2(null)],co=new WeakMap,cp=new WeakMap,cq=new WeakMap,cr=new WeakMap,cs=new WeakMap,ii(cn,4,"index",cm,iH,co),ii(cn,4,"group",cl,iH,cr),s=cn,ib(iH,(h="metadata",(i=Symbol[h])?i:Symbol.for("Symbol."+h)),s[3]);var iI=class extends hp{constructor(a,b,c){super(a,b),this.sortable=c}get index(){return this.sortable.index}get initialIndex(){return this.sortable.initialIndex}get group(){return this.sortable.group}get initialGroup(){return this.sortable.initialGroup}},iJ=class extends hq{constructor(a,b,c){super(a,b),this.sortable=c}get index(){return this.sortable.index}get group(){return this.sortable.group}},iK=Object.defineProperty,iL=Object.defineProperties,iM=Object.getOwnPropertyDescriptors,iN=Object.getOwnPropertySymbols,iO=Object.prototype.hasOwnProperty,iP=Object.prototype.propertyIsEnumerable,iQ=(a,b,c)=>b in a?iK(a,b,{enumerable:!0,configurable:!0,writable:!0,value:c}):a[b]=c,iR=(a,b)=>{for(var c in b||(b={}))iO.call(b,c)&&iQ(a,c,b[c]);if(iN)for(var c of iN(b))iP.call(b,c)&&iQ(a,c,b[c]);return a};function iS(a){let{accept:b,collisionDetector:c,collisionPriority:d,id:e,data:f,element:g,handle:h,index:i,group:j,disabled:k,modifiers:l,sensors:m,target:n,type:o,plugins:p}=a,q=iR(iR({},iF),a.transition),r=hN(b=>new iH(iL(iR({},a),iM({transition:q,register:!1,handle:hs(h),element:hs(g),target:hs(n)})),b)),s=hu(r,iT);return hx(e,()=>r.id=e),ht(()=>{c$(()=>{r.group=j,r.index=i})},[r,j,i]),hx(o,()=>r.type=o),hx(b,()=>r.accept=b,void 0,dH),hx(f,()=>f&&(r.data=f)),hx(i,()=>{var a;(null==(a=r.manager)?void 0:a.dragOperation.status.idle)&&(null==q?void 0:q.idle)&&r.refreshShape()},hv),hy(h,a=>r.handle=a),hy(g,a=>r.element=a),hy(n,a=>r.target=a),hx(k,()=>r.disabled=!0===k),hx(m,()=>r.sensors=m),hx(c,()=>r.collisionDetector=c),hx(d,()=>r.collisionPriority=d),hx(p,()=>r.plugins=p,void 0,dH),hx(q,()=>r.transition=q,void 0,dH),hx(l,()=>r.modifiers=l,void 0,dH),hx(a.alignment,()=>r.alignment=a.alignment),{sortable:s,get isDragging(){return s.isDragging},get isDropping(){return s.isDropping},get isDragSource(){return s.isDragSource},get isDropTarget(){return s.isDropTarget},handleRef:(0,cv.useCallback)(a=>{r.handle=null!=a?a:void 0},[r]),ref:(0,cv.useCallback)(a=>{var b,c;(a||null==(b=r.element)||!b.isConnected||(null==(c=r.manager)?void 0:c.dragOperation.status.idle))&&(r.element=null!=a?a:void 0)},[r]),sourceRef:(0,cv.useCallback)(a=>{var b,c;(a||null==(b=r.source)||!b.isConnected||(null==(c=r.manager)?void 0:c.dragOperation.status.idle))&&(r.source=null!=a?a:void 0)},[r]),targetRef:(0,cv.useCallback)(a=>{var b,c;(a||null==(b=r.target)||!b.isConnected||(null==(c=r.manager)?void 0:c.dragOperation.status.idle))&&(r.target=null!=a?a:void 0)},[r])}}function iT(a,b,c){return"isDragSource"===a&&!c&&!!b}var iU=a.i(490173),iV=a.i(87923);function iW(a,b,c){let d,e=c.initialDeps??[],f=!0;function g(){let g=a();return(g.length!==e.length||g.some((a,b)=>e[b]!==a))&&(e=g,d=b(...g),(null==c?void 0:c.onChange)&&!(f&&c.skipInitialOnChange)&&c.onChange(d),f=!1),d}return g.updateDeps=a=>{e=a},g}function iX(a,b){if(void 0!==a)return a;throw Error(`Unexpected undefined${b?`: ${b}`:""}`)}let iY=()=>{if(void 0!==e)return e;if("u"<typeof navigator)return e=!1;if(/iP(hone|od|ad)/.test(navigator.userAgent))return e=!0;let a=navigator.maxTouchPoints;return e="MacIntel"===navigator.platform&&void 0!==a&&a>0},iZ=a=>{let{offsetWidth:b,offsetHeight:c}=a;return{width:b,height:c}},i$=a=>a,i_=a=>{let b=Math.max(a.startIndex-a.overscan,0),c=Math.min(a.endIndex+a.overscan,a.count-1)-b+1,d=Array(c);for(let a=0;a<c;a++)d[a]=b+a;return d},i0=(a,b)=>{let c=a.scrollElement;if(!c)return;let d=a.targetWindow;if(!d)return;let e=a=>{let{width:c,height:d}=a;b({width:Math.round(c),height:Math.round(d)})};if(e(iZ(c)),!d.ResizeObserver)return()=>{};let f=new d.ResizeObserver(b=>{let d=()=>{let a=b[0];if(null==a?void 0:a.borderBoxSize){let b=a.borderBoxSize[0];if(b)return void e({width:b.inlineSize,height:b.blockSize})}e(iZ(c))};a.options.useAnimationFrameWithResizeObserver?requestAnimationFrame(d):d()});return f.observe(c,{box:"border-box"}),()=>{f.unobserve(c)}},i1={passive:!0},i2=(a,b,c)=>{var d,e;let f,g=a.scrollElement;if(!g)return;let h=a.targetWindow;if(!h)return;let i=a.options.useScrollendEvent&&!0,j=0,k=i?null:(d=()=>b(j,!1),e=a.options.isScrollingResetDelay,Object.assign(function(...a){h.clearTimeout(f),f=h.setTimeout(()=>d.apply(this,a),e)},{cancel:()=>{h.clearTimeout(f)}})),l=a=>()=>{j=c(g),null==k||k(),b(j,a)},m=l(!0),n=l(!1);return g.addEventListener("scroll",m,i1),i&&g.addEventListener("scrollend",n,i1),()=>{g.removeEventListener("scroll",m),i&&g.removeEventListener("scrollend",n),null==k||k.cancel()}},i3=(a,b)=>i2(a,b,b=>{let{horizontal:c,isRtl:d}=a.options;return c?b.scrollLeft*(d&&-1||1):b.scrollTop}),i4=(a,b,c)=>{if(c.options.useCachedMeasurements){let b=c.indexFromElement(a),d=c.options.getItemKey(b);return c.itemSizeCache.get(d)??c.options.estimateSize(b)}if(null==b?void 0:b.borderBoxSize){let a=b.borderBoxSize[0];if(a)return Math.round(a[c.options.horizontal?"inlineSize":"blockSize"])}if(!b){let b=c.indexFromElement(a),d=c.options.getItemKey(b),e=c.itemSizeCache.get(d);if(void 0!==e)return e}return a[c.options.horizontal?"offsetWidth":"offsetHeight"]},i5=(a,{adjustments:b=0,behavior:c},d)=>{var e,f;null==(f=null==(e=d.scrollElement)?void 0:e.scrollTo)||f.call(e,{[d.options.horizontal?"left":"top"]:a+b,behavior:c})};class i6{constructor(a){this.unsubs=[],this.scrollElement=null,this.targetWindow=null,this.isScrolling=!1,this.scrollState=null,this.measurementsCache=[],this._flatMeasurements=null,this.itemSizeCache=new Map,this.itemSizeCacheVersion=0,this.laneAssignments=new Map,this.pendingMin=null,this.prevLanes=void 0,this.lanesChangedFlag=!1,this.lanesSettling=!1,this.pendingScrollAnchor=null,this.scrollRect=null,this.scrollOffset=null,this.scrollDirection=null,this.scrollAdjustments=0,this._iosDeferredAdjustment=0,this._iosTouching=!1,this._iosJustTouchEnded=!1,this._iosTouchEndTimerId=null,this._intendedScrollOffset=null,this.elementsCache=new Map,this.now=()=>{var a,b,c;return(null==(c=null==(b=null==(a=this.targetWindow)?void 0:a.performance)?void 0:b.now)?void 0:c.call(b))??Date.now()},this.observer=(()=>{let a=null,b=()=>a||(this.targetWindow&&this.targetWindow.ResizeObserver?a=new this.targetWindow.ResizeObserver(a=>{a.forEach(a=>{let b=()=>{let b=a.target,c=this.indexFromElement(b);if(!b.isConnected){for(let[a,c]of(this.observer.unobserve(b),this.elementsCache))if(c===b){this.elementsCache.delete(a);break}return}this.isIndexInRange(c)&&this.shouldMeasureDuringScroll(c)&&this.resizeItem(c,this.options.measureElement(b,a,this))};this.options.useAnimationFrameWithResizeObserver?requestAnimationFrame(b):b()})}):null);return{disconnect:()=>{var c;null==(c=b())||c.disconnect(),a=null},observe:a=>{var c;return null==(c=b())?void 0:c.observe(a,{box:"border-box"})},unobserve:a=>{var c;return null==(c=b())?void 0:c.unobserve(a)}}})(),this.range=null,this.setOptions=a=>{var b,c;let d={debug:!1,initialOffset:0,overscan:1,paddingStart:0,paddingEnd:0,scrollPaddingStart:0,scrollPaddingEnd:0,horizontal:!1,getItemKey:i$,rangeExtractor:i_,onChange:()=>{},measureElement:i4,initialRect:{width:0,height:0},scrollMargin:0,gap:0,indexAttribute:"data-index",initialMeasurementsCache:[],lanes:1,anchorTo:"start",followOnAppend:!1,scrollEndThreshold:1,isScrollingResetDelay:150,enabled:!0,isRtl:!1,useScrollendEvent:!1,useAnimationFrameWithResizeObserver:!1,laneAssignmentMode:"estimate",useCachedMeasurements:!1};for(let b in a){let c=a[b];void 0!==c&&(d[b]=c)}let e=this.options,f=null,g=null,h=!1;if(void 0!==e&&e.enabled&&d.enabled&&"end"===d.anchorTo&&null!==this.scrollElement){let a=e.count,i=d.count,j=this.getMeasurements(),k=a>0?(null==(b=j[0])?void 0:b.key)??e.getItemKey(0):null,l=a>0?(null==(c=j[a-1])?void 0:c.key)??e.getItemKey(a-1):null;if(i!==a||a>0&&i>0&&(d.getItemKey(0)!==k||d.getItemKey(i-1)!==l)){h=!0;let b=a>0?this.getVirtualItemForOffset(this.getScrollOffset())??j[0]:null;b&&(f=[b.key,this.getScrollOffset()-b.start]);let c=!0===d.followOnAppend?"auto":d.followOnAppend||null;c&&i>a&&this.isAtEnd(e.scrollEndThreshold)&&(0===a||d.getItemKey(i-1)!==l)&&(g=c)}}this.options=d,h&&(this.pendingMin=0,this.itemSizeCacheVersion++);let i=!1,j=0;if(f&&null!==this.scrollOffset){let[a,b]=f,c=this.getMeasurements(),{count:d,getItemKey:e}=this.options,g=0;for(;g<d&&e(g)!==a;)g++;if(g<d){let a=c[g];if(a){let c=Math.max(0,a.start+b);c!==this.scrollOffset&&(j=c-this.scrollOffset,this.scrollOffset=c,i=!0)}}}(i||g)&&(this.pendingScrollAnchor=[i?f[0]:null,i?f[1]:0,g,j])},this.notify=a=>{var b,c;null==(c=(b=this.options).onChange)||c.call(b,this,a)},this.maybeNotify=iW(()=>(this.calculateRange(),[this.isScrolling,this.range?this.range.startIndex:null,this.range?this.range.endIndex:null]),a=>{this.notify(a)},{key:!1,debug:()=>this.options.debug,initialDeps:[this.isScrolling,this.range?this.range.startIndex:null,this.range?this.range.endIndex:null]}),this.cleanup=()=>{this.unsubs.filter(Boolean).forEach(a=>a()),this.unsubs=[],this.observer.disconnect(),null!=this.rafId&&this.targetWindow&&(this.targetWindow.cancelAnimationFrame(this.rafId),this.rafId=null),this.scrollState=null,this.isScrolling=!1,this.scrollDirection=null,this._iosDeferredAdjustment=0,this._iosTouching=!1,this._iosJustTouchEnded=!1,this.scrollElement=null,this.targetWindow=null},this._didMount=()=>()=>{this.cleanup()},this._willUpdate=()=>{var a;let b=this.options.enabled?this.options.getScrollElement():null;if(this.scrollElement!==b){if(this.cleanup(),!b)return void this.maybeNotify();if(this.scrollElement=b,this.scrollElement&&"ownerDocument"in this.scrollElement?this.targetWindow=this.scrollElement.ownerDocument.defaultView:this.targetWindow=(null==(a=this.scrollElement)?void 0:a.window)??null,this.elementsCache.forEach(a=>{this.observer.observe(a)}),this.unsubs.push(this.options.observeElementRect(this,a=>{this.scrollRect=a,this.maybeNotify()})),this.unsubs.push(this.options.observeElementOffset(this,(a,b)=>{if(b&&null===this._intendedScrollOffset&&a===this.scrollOffset)return;null!==this._intendedScrollOffset&&1.5>Math.abs(a-this._intendedScrollOffset)&&(a=this._intendedScrollOffset),this._intendedScrollOffset=null,this.scrollAdjustments=0;let c=this.getScrollOffset();this.scrollDirection=b?c===a?this.scrollDirection:c<a?"forward":"backward":null,this.scrollOffset=a,this.isScrolling=b,this._flushIosDeferredIfReady(),this.scrollState&&this.scheduleScrollReconcile(),this.maybeNotify()})),"addEventListener"in this.scrollElement){let a=this.scrollElement,b=()=>{this._iosTouching=!0,this._iosJustTouchEnded=!1,null!==this._iosTouchEndTimerId&&null!=this.targetWindow&&(this.targetWindow.clearTimeout(this._iosTouchEndTimerId),this._iosTouchEndTimerId=null)},c=()=>{this._iosTouching=!1,iY()&&null!=this.targetWindow&&(this._iosJustTouchEnded=!0,this._iosTouchEndTimerId=this.targetWindow.setTimeout(()=>{this._iosJustTouchEnded=!1,this._iosTouchEndTimerId=null,this._flushIosDeferredIfReady()},150))};a.addEventListener("touchstart",b,i1),a.addEventListener("touchend",c,i1),this.unsubs.push(()=>{a.removeEventListener("touchstart",b),a.removeEventListener("touchend",c),null!==this._iosTouchEndTimerId&&null!=this.targetWindow&&(this.targetWindow.clearTimeout(this._iosTouchEndTimerId),this._iosTouchEndTimerId=null)})}this._scrollToOffset(this.getScrollOffset(),{adjustments:void 0,behavior:void 0})}let c=this.pendingScrollAnchor;if(this.pendingScrollAnchor=null,c&&this.scrollElement&&this.options.enabled){let[a,b,d,e]=c;null===a||d||(iY()&&(this.isScrolling||this._iosTouching||this._iosJustTouchEnded)?0!==e&&(this._iosDeferredAdjustment+=e):this._scrollToOffset(this.getScrollOffset(),{adjustments:void 0,behavior:void 0})),d&&this.scrollToEnd({behavior:d})}},this._flushIosDeferredIfReady=()=>{if(0===this._iosDeferredAdjustment||this.isScrolling||this._iosTouching||this._iosJustTouchEnded)return;let a=this.getScrollOffset(),b=this.getMaxScrollOffset();if(a<0||a>b)return;if(this._iosDeferredAdjustment<0&&a>=b-1){this._iosDeferredAdjustment=0;return}let c=this._iosDeferredAdjustment;this._iosDeferredAdjustment=0,this._scrollToOffset(a,{adjustments:this.scrollAdjustments+=c,behavior:void 0})},this.rafId=null,this.getSize=()=>this.options.enabled?(this.scrollRect=this.scrollRect??this.options.initialRect,this.scrollRect[this.options.horizontal?"width":"height"]):(this.scrollRect=null,0),this.getScrollOffset=()=>this.options.enabled?(this.scrollOffset=this.scrollOffset??("function"==typeof this.options.initialOffset?this.options.initialOffset():this.options.initialOffset),this.scrollOffset):(this.scrollOffset=null,0),this.getMeasurementOptions=iW(()=>[this.options.count,this.options.paddingStart,this.options.scrollMargin,this.options.getItemKey,this.options.enabled,this.options.lanes,this.options.laneAssignmentMode,this.options.gap],(a,b,c,d,e,f,g,h)=>(void 0!==this.prevLanes&&this.prevLanes!==f&&(this.lanesChangedFlag=!0),this.prevLanes=f,this.pendingMin=null,{count:a,paddingStart:b,scrollMargin:c,getItemKey:d,enabled:e,lanes:f,laneAssignmentMode:g,gap:h}),{key:!1}),this.isIndexInRange=a=>a>=0&&a<this.options.count,this.getMeasurements=iW(()=>[this.getMeasurementOptions(),this.itemSizeCacheVersion],({count:a,paddingStart:b,scrollMargin:c,getItemKey:d,enabled:e,lanes:f,laneAssignmentMode:g,gap:h},i)=>{let j=this.itemSizeCache;if(!e)return this.measurementsCache=[],this.itemSizeCache.clear(),this.laneAssignments.clear(),[];if(this.laneAssignments.size>a)for(let b of this.laneAssignments.keys())b>=a&&this.laneAssignments.delete(b);this.lanesChangedFlag&&(this.lanesChangedFlag=!1,this.lanesSettling=!0,this.measurementsCache=[],this.itemSizeCache.clear(),this.laneAssignments.clear(),this.pendingMin=null),0!==this.measurementsCache.length||this.lanesSettling||(this.measurementsCache=this.options.initialMeasurementsCache,this.measurementsCache.forEach(a=>{this.itemSizeCache.set(a.key,a.size)}));let k=this.lanesSettling?0:this.pendingMin??0;if(this.pendingMin=null,this.lanesSettling&&this.measurementsCache.length===a&&(this.lanesSettling=!1),1===f){var l;let e,f=2*a,g=this._flatMeasurements;if(!g||g.length<f){let a=new Float64Array(f);g&&k>0&&a.set(g.subarray(0,2*k)),g=a,this._flatMeasurements=g}if(0===k)e=b+c;else{let a=k-1;e=g[2*a]+g[2*a+1]+h}for(let b=k;b<a;b++){let a=d(b),c=j.get(a),f="number"==typeof c?c:this.options.estimateSize(b);g[2*b]=e,g[2*b+1]=f,e+=f+h}let i=(l=g,new Proxy(Array(a),{get(b,c,e){if("string"==typeof c){let e=c.charCodeAt(0);if(e>=48&&e<=57){let e=+c;if(Number.isInteger(e)&&e>=0&&e<a){let a=b[e];if(!a){let c=l[2*e];a=b[e]={index:e,key:d(e),start:c,size:l[2*e+1],end:c+l[2*e+1],lane:0}}return a}}if("length"===c)return a}return Reflect.get(b,c,e)}}));return this.measurementsCache=i,i}let m=this.measurementsCache.slice(0,k),n=Array(f).fill(void 0),o=new Float64Array(f),p=0;for(let a=0;a<k;a++){let b=m[a];b&&(void 0===n[b.lane]&&p++,n[b.lane]=a,o[b.lane]=b.end)}for(let e=k;e<a;e++){let a,i,k=d(e),l=this.laneAssignments.get(e),q="estimate"===g||j.has(k);if(void 0!==l&&this.options.lanes>1){let d=n[a=l],e=void 0!==d?m[d]:void 0;i=e?e.end+h:b+c}else if(p===f){let b=0,c=o[0],d=n[0];for(let a=1;a<f;a++){let e=o[a];(e<c||e===c&&n[a]<d)&&(b=a,c=e,d=n[a])}a=b,i=c+h,q&&this.laneAssignments.set(e,a)}else a=e%this.options.lanes,i=b+c,q&&this.laneAssignments.set(e,a);let r=j.get(k),s="number"==typeof r?r:this.options.estimateSize(e),t=i+s;m[e]={index:e,start:i,size:s,end:t,key:k,lane:a},void 0===n[a]&&p++,n[a]=e,o[a]=t}return this.measurementsCache=m,m},{key:!1,debug:()=>this.options.debug}),this.calculateRange=iW(()=>[this.getMeasurements(),this.getSize(),this.getScrollOffset(),this.options.lanes],(a,b,c,d)=>0===a.length||0===b?(this.range=null,null):(this.range=function(a,b,c,d,e){let f=a.length-1;if(a.length<=d)return{startIndex:0,endIndex:f};if(1===d&&null!==e){let a=function(a,b,c){let d=0;for(;d<=b;){let e=(d+b)/2|0,f=a[2*e];if(f<c)d=e+1;else{if(!(f>c))return e;b=e-1}}return d>0?d-1:0}(e,f,c),d=a,g=c+b;for(;d<f&&e[2*d]+e[2*d+1]<g;)d++;return{startIndex:a,endIndex:d}}let g=i7(0,f,b=>a[b].start,c),h=g;if(1===d)for(;h<f&&a[h].end<c+b;)h++;else if(d>1){let e=Array(d).fill(0);for(;h<f&&e.some(a=>a<c+b);){let b=a[h];e[b.lane]=b.end,h++}let i=Array(d).fill(c+b);for(;g>=0&&i.some(a=>a>=c);){let b=a[g];i[b.lane]=b.start,g--}g=Math.max(0,g-g%d),h=Math.min(f,h+(d-1-h%d))}return{startIndex:g,endIndex:h}}(a,b,c,d,1===d&&null!=this._flatMeasurements?this._flatMeasurements:null),this.range),{key:!1,debug:()=>this.options.debug}),this.getVirtualIndexes=iW(()=>{let a=null,b=null,c=this.calculateRange();return c&&(a=c.startIndex,b=c.endIndex),this.maybeNotify.updateDeps([this.isScrolling,a,b]),[this.options.rangeExtractor,this.options.overscan,this.options.count,a,b]},(a,b,c,d,e)=>null===d||null===e?[]:a({startIndex:d,endIndex:e,overscan:b,count:c}),{key:!1,debug:()=>this.options.debug}),this.indexFromElement=a=>{let b=this.options.indexAttribute,c=a.getAttribute(b);return c?parseInt(c,10):(console.warn(`Missing attribute name '${b}={index}' on measured element.`),-1)},this.shouldMeasureDuringScroll=a=>{var b;if(!this.scrollState||"smooth"!==this.scrollState.behavior)return!0;let c=this.scrollState.index??(null==(b=this.getVirtualItemForOffset(this.scrollState.lastTargetOffset))?void 0:b.index);if(void 0!==c&&this.range){let b=Math.max(this.options.overscan,Math.ceil((this.range.endIndex-this.range.startIndex)/2)),d=Math.max(0,c-b),e=Math.min(this.options.count-1,c+b);return a>=d&&a<=e}return!0},this.measureElement=a=>{if(!a)return void this.elementsCache.forEach((a,b)=>{a.isConnected||(this.observer.unobserve(a),this.elementsCache.delete(b))});let b=this.indexFromElement(a);if(!this.isIndexInRange(b))return;let c=this.options.getItemKey(b),d=this.elementsCache.get(c);d!==a&&(d&&this.observer.unobserve(d),this.observer.observe(a),this.elementsCache.set(c,a)),(!this.isScrolling||this.scrollState)&&this.shouldMeasureDuringScroll(b)&&this.resizeItem(b,this.options.measureElement(a,void 0,this))},this.resizeItem=(a,b)=>{var c,d;let e,f,g;if(!this.isIndexInRange(a))return;let h=this._flatMeasurements;if(1===this.options.lanes&&null!==h)g=this.options.getItemKey(a),f=h[2*a],e=h[2*a+1];else{let b=this.measurementsCache[a];if(!b)return;g=b.key,f=b.start,e=b.size}let i=this.itemSizeCache.get(g)??e,j=b-i;if(0!==j){let h="end"===this.options.anchorTo&&(null==(c=this.scrollState)?void 0:c.behavior)!=="smooth"&&this.getVirtualDistanceFromEnd()<=this.options.scrollEndThreshold,k=h?this.getTotalSize():0,l=this.getScrollOffset()+this.scrollAdjustments,m=this.itemSizeCache.has(g)?f+i<=l&&"backward"!==this.scrollDirection:f<l,n=(null==(d=this.scrollState)?void 0:d.behavior)!=="smooth"&&(void 0!==this.shouldAdjustScrollPositionOnItemSizeChange?this.shouldAdjustScrollPositionOnItemSizeChange(this.measurementsCache[a]??{index:a,key:g,start:f,size:e,end:f+e,lane:0},j,this):m);(null===this.pendingMin||a<this.pendingMin)&&(this.pendingMin=a),this.itemSizeCache.set(g,b),this.itemSizeCacheVersion++;let o=!1;h?o=this.applyScrollAdjustment(this.getTotalSize()-k):n&&(o=this.applyScrollAdjustment(j)),this.notify(o)}},this.getVirtualItems=iW(()=>[this.getVirtualIndexes(),this.getMeasurements()],(a,b)=>{let c=[];for(let d=0,e=a.length;d<e;d++){let e=b[a[d]];c.push(e)}return c},{key:!1,debug:()=>this.options.debug}),this.getVirtualItemForOffset=a=>{let b=this.getMeasurements();if(0===b.length)return;let c=this._flatMeasurements,d=1===this.options.lanes&&null!=c,e=i7(0,b.length-1,d?a=>c[2*a]:a=>iX(b[a]).start,a);return iX(b[e])},this.getMaxScrollOffset=()=>{if(!this.scrollElement)return 0;if("scrollHeight"in this.scrollElement)return this.options.horizontal?this.scrollElement.scrollWidth-this.scrollElement.clientWidth:this.scrollElement.scrollHeight-this.scrollElement.clientHeight;{let a=this.scrollElement.document.documentElement;return this.options.horizontal?a.scrollWidth-this.scrollElement.innerWidth:a.scrollHeight-this.scrollElement.innerHeight}},this.getVirtualDistanceFromEnd=()=>Math.max(this.getTotalSize()-this.getSize()-this.getScrollOffset(),0),this.getDistanceFromEnd=()=>Math.max(this.getMaxScrollOffset()-this.getScrollOffset(),0),this.isAtEnd=(a=this.options.scrollEndThreshold)=>this.getDistanceFromEnd()<=a,this.getOffsetForAlignment=(a,b,c=0)=>{if(!this.scrollElement)return 0;let d=this.getSize(),e=this.getScrollOffset();return"auto"===b&&(b=a>=e+d?"end":"start"),"center"===b?a+=(c-d)/2:"end"===b&&(a-=d),Math.max(Math.min(this.getMaxScrollOffset(),a),0)},this.getOffsetForIndex=(a,b="auto")=>{a=Math.max(0,Math.min(a,this.options.count-1));let c=this.getSize(),d=this.getScrollOffset(),e=this.measurementsCache[a];if(!e)return;if("auto"===b)if(e.end>=d+c-this.options.scrollPaddingEnd)b="end";else{if(!(e.start<=d+this.options.scrollPaddingStart))return[d,b];b="start"}if("end"===b&&a===this.options.count-1)return[this.getMaxScrollOffset(),b];let f="end"===b?e.end+this.options.scrollPaddingEnd:e.start-this.options.scrollPaddingStart;return[this.getOffsetForAlignment(f,b,e.size),b]},this.scrollToOffset=(a,{align:b="start",behavior:c="auto"}={})=>{this._iosDeferredAdjustment=0;let d=this.getOffsetForAlignment(a,b),e=this.now();this.scrollState={index:null,align:b,behavior:c,startedAt:e,lastTargetOffset:d,stableFrames:0},this._scrollToOffset(d,{adjustments:void 0,behavior:c}),this.scheduleScrollReconcile()},this.scrollToIndex=(a,{align:b="auto",behavior:c="auto"}={})=>{this._iosDeferredAdjustment=0,a=Math.max(0,Math.min(a,this.options.count-1));let d=this.getOffsetForIndex(a,b);if(!d)return;let[e,f]=d,g=this.now();this.scrollState={index:a,align:f,behavior:c,startedAt:g,lastTargetOffset:e,stableFrames:0},this._scrollToOffset(e,{adjustments:void 0,behavior:c}),this.scheduleScrollReconcile()},this.scrollBy=(a,{behavior:b="auto"}={})=>{let c=this.getScrollOffset()+a,d=this.now();this.scrollState={index:null,align:"start",behavior:b,startedAt:d,lastTargetOffset:c,stableFrames:0},this._scrollToOffset(c,{adjustments:void 0,behavior:b}),this.scheduleScrollReconcile()},this.scrollToEnd=({behavior:a="auto"}={})=>{this.options.count>0?this.scrollToIndex(this.options.count-1,{align:"end",behavior:a}):this.scrollToOffset(Math.max(this.getTotalSize()-this.getSize(),0),{behavior:a})},this.getTotalSize=()=>{var a;let b,c=this.getMeasurements();if(0===c.length)b=this.options.paddingStart;else if(1===this.options.lanes){let d=c.length-1,e=this._flatMeasurements;b=null!=e?e[2*d]+e[2*d+1]:(null==(a=c[d])?void 0:a.end)??0}else{let a=Array(this.options.lanes).fill(null),d=c.length-1;for(;d>=0&&a.some(a=>null===a);){let b=c[d];null===a[b.lane]&&(a[b.lane]=b.end),d--}b=Math.max(...a.filter(a=>null!==a))}return Math.max(b-this.options.scrollMargin+this.options.paddingEnd,0)},this.takeSnapshot=()=>{let a=[];if(0===this.itemSizeCache.size)return a;for(let b of this.getMeasurements())b&&this.itemSizeCache.has(b.key)&&a.push({index:b.index,key:b.key,start:b.start,size:b.size,end:b.end,lane:b.lane});return a},this._scrollToOffset=(a,{adjustments:b,behavior:c})=>{this._intendedScrollOffset=a+(b??0),this.options.scrollToFn(a,{behavior:c,adjustments:b},this)},this.measure=()=>{this.pendingMin=null,this.itemSizeCache.clear(),this.laneAssignments.clear(),this.itemSizeCacheVersion++,this.notify(!1)},this.setOptions(a)}applyScrollAdjustment(a,b){return 0!==a&&(iY()&&(this.isScrolling||this._iosTouching||this._iosJustTouchEnded)?(this._iosDeferredAdjustment+=a,!1):(this._scrollToOffset(this.getScrollOffset(),{adjustments:this.scrollAdjustments+=a,behavior:b}),null!==this.scrollOffset&&(this.scrollOffset+=this.scrollAdjustments,this.scrollOffset<0&&(this.scrollOffset=0),this.scrollAdjustments=0),!0))}scheduleScrollReconcile(){if(!this.targetWindow){this.scrollState=null;return}null==this.rafId&&(this.rafId=this.targetWindow.requestAnimationFrame(()=>{this.rafId=null,this.reconcileScroll()}))}reconcileScroll(){if(!this.scrollState||!this.scrollElement)return;if(this.now()-this.scrollState.startedAt>5e3){this.scrollState=null;return}let a=null!=this.scrollState.index?this.getOffsetForIndex(this.scrollState.index,this.scrollState.align):void 0,b=a?a[0]:this.scrollState.lastTargetOffset,c=b!==this.scrollState.lastTargetOffset;if(!c&&1.01>Math.abs(b-this.getScrollOffset())){if(this.scrollState.stableFrames++,this.scrollState.stableFrames>=1){this.getScrollOffset()!==b&&this._scrollToOffset(b,{adjustments:void 0,behavior:"auto"}),this.scrollState=null;return}}else if(this.scrollState.stableFrames=0,c){let a=this.getSize()||600,c=Math.abs(b-this.getScrollOffset()),d="smooth"===this.scrollState.behavior&&c>a;this.scrollState.lastTargetOffset=b,d||(this.scrollState.behavior="auto"),this._scrollToOffset(b,{adjustments:void 0,behavior:d?"smooth":"auto"})}this.scheduleScrollReconcile()}}let i7=(a,b,c,d)=>{for(;a<=b;){let e=(a+b)/2|0,f=c(e);if(f<d)a=e+1;else{if(!(f>d))return e;b=e-1}}return a>0?a-1:0},i8="u">typeof document?cv.useLayoutEffect:cv.useEffect;function i9(a){return function({useFlushSync:a=!0,directDomUpdates:b=!1,directDomUpdatesMode:c="transform",...d}){let e=cv.useReducer(a=>a+1,0)[1],f=cv.useRef({enabled:b,mode:c,container:null,lastSize:null,lastPositions:new WeakMap,prevRange:null});f.current.enabled=b,f.current.mode=c;let g=a=>{let b=f.current;if(!b.enabled||!b.container)return;let c=a.getTotalSize();if(c!==b.lastSize){b.lastSize=c;let d=a.options.horizontal?"width":"height";b.container.style[d]=`${c}px`}},h=a=>{let b=f.current;if(!b.enabled||!b.container)return;g(a);let c=!!a.options.horizontal,d="transform"===b.mode,e=c?"left":"top",h=a.options.scrollMargin;for(let f of a.getVirtualItems()){let g=f.start-h,i=a.elementsCache.get(f.key);i&&b.lastPositions.get(i)!==g&&(b.lastPositions.set(i,g),d?i.style.transform=c?`translate3d(${g}px, 0, 0)`:`translate3d(0, ${g}px, 0)`:i.style[e]=`${g}px`)}},i={...d,onChange:(b,c)=>{var g;let i=f.current,j=!0;if(i.enabled){h(b);let a=b.range,c=i.prevRange;(j=!c||c.isScrolling!==b.isScrolling||c.startIndex!==(null==a?void 0:a.startIndex)||c.endIndex!==(null==a?void 0:a.endIndex))&&(i.prevRange=a?{startIndex:a.startIndex,endIndex:a.endIndex,isScrolling:b.isScrolling}:null)}j&&(a&&c?(0,hr.flushSync)(e):e()),null==(g=d.onChange)||g.call(d,b,c)}},[j]=cv.useState(()=>{let a=new i6(i);return Object.assign(a,{containerRef:b=>{let c=f.current;if(c.container=b,c.lastSize=null,b&&c.enabled){let d=a.getTotalSize();c.lastSize=d;let e=a.options.horizontal?"width":"height";b.style[e]=`${d}px`}}})});return j.setOptions(i),i8(()=>j._didMount(),[]),i8(()=>(g(j),j._willUpdate())),i8(()=>{h(j)}),j}({observeElementRect:i0,observeElementOffset:i3,scrollToFn:i5,...a})}var ja=a.i(591023);(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var jb=a=>Array.isArray(a)?[...a]:(a=>{if("object"!=typeof a||null===a)return!1;let b=Object.getPrototypeOf(a);return b===Object.prototype||null===b})(a)?(0,cR.__spreadValues)({},a):{};function jc(a,b,c){let d=b.split("."),e=(0,cR.__spreadValues)({},a),f=e;for(let a=0;a<d.length;a++){let[b,e]=d[a].replace("]","").split("["),g=a===d.length-1;if(void 0!==e){f[b]=Array.isArray(f[b])?[...f[b]]:[];let a=Number(e);if(g){f[b][a]=c;continue}f[b][a]=jb(f[b][a]),f=f[b][a];continue}if(g){f[b]=c;continue}f[b]=jb(f[b]),f=f[b]}return e}(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var jd=/^(data-.*)$/,je=(0,cA.get_class_name_factory_default)("Button",{Button:"_Button_oe4qj_1","Button--medium":"_Button--medium_oe4qj_34","Button--large":"_Button--large_oe4qj_62","Button-icon":"_Button-icon_oe4qj_89","Button--primary":"_Button--primary_oe4qj_93","Button--disabled":"_Button--disabled_oe4qj_123","Button--secondary":"_Button--secondary_oe4qj_135","Button--flush":"_Button--flush_oe4qj_171","Button--fullWidth":"_Button--fullWidth_oe4qj_179","Button-spinner":"_Button-spinner_oe4qj_184"}),jf=a=>{var{children:b,href:c,onClick:d,variant:e="primary",type:f,disabled:g,tabIndex:h,newTab:i,fullWidth:j,icon:k,size:l="medium",loading:m=!1}=a,n=(0,cR.__objRest)(a,["children","href","onClick","variant","type","disabled","tabIndex","newTab","fullWidth","icon","size","loading"]);let[o,p]=(0,cv.useState)(m);(0,cv.useEffect)(()=>p(m),[m]);let q=(a=>{let b={};for(let c in a)Object.prototype.hasOwnProperty.call(a,c)&&jd.test(c)&&(b[c]=a[c]);return b})(n);return(0,cS.jsxs)(c?"a":f?"button":"span",(0,cR.__spreadProps)((0,cR.__spreadValues)({className:je({primary:"primary"===e,secondary:"secondary"===e,disabled:g,fullWidth:j,[l]:!0}),onClick:a=>{d&&(p(!0),Promise.resolve(d(a)).then(()=>{p(!1)}))},type:f,disabled:g||o,tabIndex:h,target:i?"_blank":void 0,rel:i?"noreferrer":void 0,href:c},q),{children:[k&&(0,cS.jsx)("div",{className:je("icon"),children:k}),b,o&&(0,cS.jsx)("div",{className:je("spinner"),children:(0,cS.jsx)(cP.Loader,{size:14})})]}))};(0,cR.init_react_import)(),(0,cR.init_react_import)();var jg={InputWrapper:"_InputWrapper_qyenz_1","Input-label":"_Input-label_qyenz_5","Input-labelIcon":"_Input-labelIcon_qyenz_17","Input-disabledIcon":"_Input-disabledIcon_qyenz_24","Input-input":"_Input-input_qyenz_29","Input-select":"_Input-select_qyenz_61","Input-selectIcon":"_Input-selectIcon_qyenz_71",Input:"_Input_qyenz_1","Input--readOnly":"_Input--readOnly_qyenz_111","Input-radioGroupItems":"_Input-radioGroupItems_qyenz_150","Input-radio":"_Input-radio_qyenz_150","Input-radioInner":"_Input-radioInner_qyenz_179","Input-radioInput":"_Input-radioInput_qyenz_261"},jh=(0,cA.get_class_name_factory_default)("Input",jg),ji=({children:a,icon:b,label:c,el:d="label",readOnly:e,className:f})=>{let g=(0,cP.useMessage)("field-readonly");return(0,cS.jsxs)(d,{className:f,children:[(0,cS.jsxs)("div",{className:jh("label"),children:[b?(0,cS.jsx)("div",{className:jh("labelIcon"),children:b}):(0,cS.jsx)(cS.Fragment,{}),c,e&&(0,cS.jsx)("div",{className:jh("disabledIcon"),title:g,children:(0,cS.jsx)(cP.Lock,{size:"12"})})]}),a]})},jj=({children:a,icon:b,label:c,el:d="label",readOnly:e})=>{let f=(0,cP.useAppStore)(a=>a.overrides),g=(0,cv.useMemo)(()=>f.fieldLabel||ji,[f]);return c?(0,cS.jsx)(g,{label:c,icon:b,className:jh({readOnly:e}),readOnly:e,el:d,children:a}):(0,cS.jsx)(cS.Fragment,{children:a})};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var jk={ArrayField:"_ArrayField_62huh_5","ArrayField--isDraggingFrom":"_ArrayField--isDraggingFrom_62huh_30","ArrayField-addButton":"_ArrayField-addButton_62huh_38","ArrayField--hasItems":"_ArrayField--hasItems_62huh_58","ArrayField-inner":"_ArrayField-inner_62huh_93",ArrayFieldItem:"_ArrayFieldItem_62huh_101","ArrayFieldItem--isDragging":"_ArrayFieldItem--isDragging_62huh_110","ArrayFieldItem--isExpanded":"_ArrayFieldItem--isExpanded_62huh_114","ArrayFieldItem-summary":"_ArrayFieldItem-summary_62huh_132","ArrayFieldItem--noFields":"_ArrayFieldItem--noFields_62huh_167","ArrayField--addDisabled":"_ArrayField--addDisabled_62huh_176","ArrayFieldItem-body":"_ArrayFieldItem-body_62huh_228","ArrayFieldItem-fieldset":"_ArrayFieldItem-fieldset_62huh_237","ArrayFieldItem-rhs":"_ArrayFieldItem-rhs_62huh_250","ArrayFieldItem-actions":"_ArrayFieldItem-actions_62huh_256"};function jl(a,b){let c=(0,cv.useContext)(a);if(!c)throw Error("useContextStore must be used inside context");return(0,cW.useStore)(c,cU(b))}(0,cR.init_react_import)(),(0,cR.init_react_import)();var jm=(t={},{ctx:j=(0,cv.createContext)((0,cV.createStore)((0,cX.subscribeWithSelector)(()=>t))),Provider:({children:a,value:b})=>{let[c]=(0,cv.useState)(()=>(0,cV.createStore)(()=>b));return(0,cS.jsx)(j.Provider,{value:c,children:a})}}),jn=()=>(0,cv.useContext)(jm.ctx);function jo(a){let b=(0,cv.useContext)(jm.ctx);if(!b)throw Error("useContextStore must be used inside context");return(0,cW.useStore)(b,cU(a))}(0,cR.init_react_import)(),(0,cR.init_react_import)();var jp=(0,cA.get_class_name_factory_default)("DragIcon",{DragIcon:"_DragIcon_5e515_1","DragIcon--disabled":"_DragIcon--disabled_5e515_10"}),jq=({isDragDisabled:a})=>(0,cS.jsx)("div",{className:jp({disabled:a}),children:(0,cS.jsx)("svg",{viewBox:"0 0 20 20",width:"12",fill:"currentColor",children:(0,cS.jsx)("path",{d:"M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"})})});(0,cR.init_react_import)(),(0,cR.init_react_import)();var{Delay:jr,Distance:js}=hf,jt=[new jr({value:200,tolerance:10})],ju=[new jr({value:200,tolerance:10}),new js({value:5})],jv=({other:a=ju,mouse:b,touch:c=jt}={touch:jt,other:ju})=>{let[d]=(0,cv.useState)(()=>[hh.configure({activationConstraints(d,e){var f;let{pointerType:g,target:h}=d;return"mouse"===g&&f9(h)&&(e.handle===h||(null==(f=e.handle)?void 0:f.contains(h)))?b:"touch"===g?c:a}})]);return d};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var jw=(a,b,c,d,e)=>{},jx="increasing";(0,cR.init_react_import)();var jy=(a,b)=>{if("dynamic"===a){if(!(Math.abs(b.y)>Math.abs(b.x)))return 0===b.x?null:b.x>0?"right":"left"}else if("x"===a)return 0===b.x?null:b.x>0?"right":"left";return 0===b.y?null:b.y>0?"down":"up"};(0,cR.init_react_import)(),(0,cR.init_react_import)();var jz={current:{x:0,y:0},delta:{x:0,y:0},previous:{x:0,y:0},direction:null};(0,cR.init_react_import)();var jA=({dragOperation:a,droppable:b})=>{let c=a.position.current;if(!c)return null;let{id:d}=b;return b.shape&&b.shape.containsPoint(c)?{id:d,value:1/d8.distance(b.shape.center,c),type:eZ.PointerIntersection,priority:eY.High}:null};(0,cR.init_react_import)();var jB=(0,cV.createStore)(()=>({fallbackEnabled:!1})),jC="",jD=(a,b=.05)=>c=>{var d,e,f,g,h;let{dragOperation:i,droppable:j}=c,{position:k}=i,l=null==(d=i.shape)?void 0:d.current,{shape:m}=j;if(!l||!m)return null;let{center:n}=l,{fallbackEnabled:o}=jB.getState(),p=((a,b="dynamic")=>(jz.current=a,jz.delta={x:a.x-jz.previous.x,y:a.y-jz.previous.y},jz.direction=jy(b,jz.delta)||jz.direction,(Math.abs(jz.delta.x)>10||Math.abs(jz.delta.y)>10)&&(jz.previous=d8.from(a)),jz))(k.current,a),q={direction:p.direction},{center:r}=m,s=((a,b,c,d=0)=>{let e=a.boundingRectangle,f=b.center;if("down"===c){let a=d*b.boundingRectangle.height;return e.bottom>=f.y+a}if("up"===c){let a=d*b.boundingRectangle.height;return e.top<f.y-a}if("left"===c){let a=d*b.boundingRectangle.width;return f.x-a>=e.left}let g=d*b.boundingRectangle.width;return e.right-g>=f.x})(l,m,p.direction,b);if((null==(e=i.source)?void 0:e.id)===j.id){let a=((a,b)=>{var c;let{dragOperation:d,droppable:e}=a,{shape:f}=e,{position:g}=d,h=null==(c=d.shape)?void 0:c.current;if(!h||!f)return null;let i=f.center,j=Math.sqrt(Math.pow(i.x-b.x,2)+Math.pow(i.y-b.y,2)),k=Math.sqrt(Math.pow(i.x-g.current.x,2)+Math.pow(i.y-g.current.y,2));return(jx=k===j?jx:k<j?"decreasing":"increasing",jw(h.center,i,e.id.toString(),"rebeccapurple"),"decreasing"===jx)?{id:e.id,value:1,type:eZ.Collision}:null})(c,p.previous);if(jw(n,r,j.id.toString(),"yellow"),a)return(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{priority:eY.Highest,data:q})}let t=l.intersectionArea(m),u=t/m.area;if(t&&s){jw(n,r,j.id.toString(),"green",p.direction);let a={id:j.id,value:u,priority:eY.High,type:eZ.Collision},b=jC===j.id;return jC="",(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{id:b?"flush":a.id,data:q})}if(o&&(null==(f=i.source)?void 0:f.id)!==j.id){let b=m.boundingRectangle.right>l.boundingRectangle.left&&m.boundingRectangle.left<l.boundingRectangle.right,d=m.boundingRectangle.bottom>l.boundingRectangle.top&&m.boundingRectangle.top<l.boundingRectangle.bottom;if("y"===a&&b||d){let b=(a=>{let{dragOperation:b,droppable:c}=a,{shape:d,position:e}=b;if(!c.shape)return null;let f=d?d9.from(d.current.boundingRectangle).corners:void 0,g=d9.from(c.shape.boundingRectangle).corners.reduce((a,b,c)=>{var d;return a+d8.distance(d8.from(b),null!=(d=null==f?void 0:f[c])?d:e.current)},0);return{id:c.id,value:1/(g/4),type:eZ.Collision,priority:eY.Normal}})(c);if(b){let c=jy(a,{x:l.center.x-((null==(g=j.shape)?void 0:g.center.x)||0),y:l.center.y-((null==(h=j.shape)?void 0:h.center.y)||0)});return(q.direction=c,t)?(jw(n,r,j.id.toString(),"red",c||""),jC=j.id,(0,cR.__spreadProps)((0,cR.__spreadValues)({},b),{priority:eY.Low,data:q})):(jw(n,r,j.id.toString(),"orange",c||""),(0,cR.__spreadProps)((0,cR.__spreadValues)({},b),{priority:eY.Lowest,data:q}))}}}return jw(n,r,j.id.toString(),"hotpink"),null};(0,cR.init_react_import)();var jE=(a,b="ltr")=>"up"===a||"ltr"===b&&"left"===a||"rtl"===b&&"right"===a?"before":"after",jF=({position:a,sourceIndex:b,targetIndex:c,isSameZone:d})=>{let e=c;return d&&e>=b&&(e-=1),"after"===a&&(e+=1),e},jG=({children:a,onDragStart:b,onDragEnd:c,onMove:d})=>{let e=jv({mouse:[new hf.Distance({value:5})]});return(0,cS.jsx)(hL,{sensors:e,onDragStart:a=>{var c,d;return b(null!=(d=null==(c=a.operation.source)?void 0:c.id.toString())?d:"")},onDragOver:(a,b)=>{var c;a.preventDefault();let{operation:e}=a,{source:f,target:g}=e;if(!f||!g)return;let h=f.data.index,i=g.data.index,j=null==(c=b.collisionObserver.collisions[0])?void 0:c.data;h!==i&&f.id!==g.id&&d({source:h,target:jF({position:jE(null==j?void 0:j.direction),sourceIndex:h,targetIndex:i,isSameZone:!0})})},onDragEnd:()=>{setTimeout(()=>{c()},250)},children:a})},jH=({id:a,index:b,disabled:c,children:d,type:e="item"})=>{let{ref:f,isDragging:g,isDropping:h,handleRef:i}=iS({id:a,type:e,index:b,disabled:c,data:{index:b},collisionDetector:jD("y")});return d({isDragging:g,isDropping:h,ref:f,handleRef:i})};(0,cR.init_react_import)();var jI=(0,cv.createContext)({}),jJ=()=>{let a=(0,cv.useContext)(jI);return(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{readOnlyFields:a.readOnlyFields||{}})},jK=({children:a,name:b,subName:c,wildcardName:d=b,readOnlyFields:e})=>{let f=`${b}.${c}`,g=`${d}.${c}`,h=(0,cv.useMemo)(()=>Object.keys(e).reduce((a,c)=>{if(c.indexOf(f)>-1||c.indexOf(g)>-1){let f=new RegExp(`^(${b}|${d}).`.replace(/\[/g,"\\[").replace(/\]/g,"\\]").replace(/\./g,"\\.").replace(/\*/g,"\\*")),g=c.replace(f,"");return(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{[g]:e[c]})}return a},{}),[b,c,d,e]);return(0,cS.jsx)(jI.Provider,{value:{readOnlyFields:h,localName:c},children:a})};(0,cR.init_react_import)();var jL=(a,b)=>b.split(".").reduce((a,b)=>{if(!a)return;let[c,d]=b.replace("]","").split("["),e=a[c];return d&&e?e[parseInt(d)]:e},a);(0,cR.init_react_import)();var jM=(0,cv.memo)(({field:a,id:b,index:c,name:d,subName:e,localName:f,onChange:g,forceReadOnly:h})=>{let i=void 0!==c?`${d}[${c}]`:d,j=d?`${i}.${e}`:e,k=void 0!==c?`${f}[${c}]`:null!=f?f:e,l=void 0!==c?`${f}[*]`:f,m=`${k}.${e}`,n=`${l}.${e}`,{readOnlyFields:o}=jJ(),p=h||(void 0!==o[j]?o[m]:o[n]),q=a.label||e;return(0,cS.jsx)(jK,{name:k,wildcardName:l,subName:e,readOnlyFields:o,children:(0,cS.jsx)(ke,{name:j,label:q,id:b,readOnly:p,field:(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{label:q}),onChange:(a,b)=>{g(a,b,e)}})})}),jN=(0,cA.get_class_name_factory_default)("ArrayField",jk),jO=(0,cA.get_class_name_factory_default)("ArrayFieldItem",jk),jP=(0,cv.memo)(({index:a,originalIndex:b,field:c,name:d})=>{let e=jo(b=>jL(b,`${[d]}[${a}]`)),f=(0,cP.useMessage)("field-arrayitem-summary",{index:b});return(0,cv.useMemo)(()=>e&&c.getItemSummary?c.getItemSummary(e,a):f,[e,c,b,a,f])}),jQ=(0,cv.memo)(({id:a,arrayId:b,index:c,dragIndex:d,originalIndex:e,field:f,onChange:g,onToggleExpand:h,readOnly:i,actions:j,name:k,localName:l})=>{let m=(0,cP.useAppStore)(c=>{var d;return(null==(d=c.state.ui.arrayState[b])?void 0:d.openId)===a}),n=(0,cP.useAppStore)(a=>a.permissions.getPermissions({item:a.selectedItem}).edit),o=(0,cv.useMemo)(()=>!!f.arrayFields&&Object.values(f.arrayFields).some(a=>"slot"!==a.type&&!1!==a.visible),[f.arrayFields]);return(0,cS.jsx)(jH,{id:a,index:d,disabled:i,children:({isDragging:b,ref:d,handleRef:p})=>(0,cS.jsxs)("div",{ref:d,className:jO({isExpanded:m&&o,isDragging:b,noFields:!o}),children:[(0,cS.jsxs)("div",{ref:p,onClick:c=>{b||(c.preventDefault(),c.stopPropagation(),o&&h(a,m))},className:jO("summary"),children:[(0,cS.jsx)(jP,{index:c,originalIndex:e,field:f,name:k}),(0,cS.jsxs)("div",{className:jO("rhs"),children:[!i&&(0,cS.jsx)("div",{className:jO("actions"),children:j}),(0,cS.jsx)("div",{children:(0,cS.jsx)(jq,{})})]})]}),(0,cS.jsx)("div",{className:jO("body"),children:m&&o&&(0,cS.jsx)("fieldset",{className:jO("fieldset"),children:Object.keys(f.arrayFields).map(b=>{let d=f.arrayFields[b];return(0,cS.jsx)(jM,{id:`${a}_${b}`,name:k,index:c,subName:b,localName:l,field:d,onChange:g,forceReadOnly:!n},`${a}_${b}_${c}`)})})})]})})});(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var jR=(a,b=!0)=>jo(c=>b?jL(c,a):void 0);(0,cR.init_react_import)();var jS=(a,b,{tracked:c=!0,fallback:d}={})=>{let e=jR(a,c),f=(0,cP.useAppStore)(b=>b.state.ui.field.focus===a),[g,h]=(0,cv.useState)(e),i=(0,cv.useCallback)((a,...c)=>{h(a),b(a,...c)},[b]);return((0,cv.useEffect)(()=>{c&&(f||h(e))},[c,f,e]),c)?[void 0!==d&&null==g?d:g,i]:[void 0,b]},jT=(0,cA.get_class_name_factory_default)("Input",jg),jU=({field:a,onChange:b,readOnly:c,id:d,name:e=d,label:f,labelIcon:g,Label:h})=>{let[i,j]=jS(e,b,{fallback:""});return(0,cS.jsx)(h,{label:f||e,icon:g||(0,cS.jsxs)(cS.Fragment,{children:["text"===a.type&&(0,cS.jsx)(cP.Type,{size:16}),"number"===a.type&&(0,cS.jsx)(cP.Hash,{size:16})]}),readOnly:c,children:(0,cS.jsx)("input",{className:jT("input"),autoComplete:"off",type:a.type,title:f||e,name:e,value:i,onChange:b=>{if("number"===a.type){let c=Number(b.currentTarget.value);(void 0===a.min||!(c<a.min))&&(void 0!==a.max&&c>a.max||j(c))}else j(b.currentTarget.value)},readOnly:c,tabIndex:c?-1:void 0,id:d,min:"number"===a.type?a.min:void 0,max:"number"===a.type?a.max:void 0,placeholder:"text"===a.type||"number"===a.type?a.placeholder:void 0,step:"number"===a.type?a.step:void 0})})};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var jV={"ExternalInput-actions":"_ExternalInput-actions_143vl_1","ExternalInput-button":"_ExternalInput-button_143vl_5","ExternalInput--dataSelected":"_ExternalInput--dataSelected_143vl_34","ExternalInput--readOnly":"_ExternalInput--readOnly_143vl_41","ExternalInput-detachButton":"_ExternalInput-detachButton_143vl_48",ExternalInput:"_ExternalInput_143vl_1",ExternalInputModal:"_ExternalInputModal_143vl_118","ExternalInputModal-grid":"_ExternalInputModal-grid_143vl_128","ExternalInputModal--filtersToggled":"_ExternalInputModal--filtersToggled_143vl_139","ExternalInputModal-filters":"_ExternalInputModal-filters_143vl_144","ExternalInputModal-masthead":"_ExternalInputModal-masthead_143vl_164","ExternalInputModal-tableWrapper":"_ExternalInputModal-tableWrapper_143vl_173","ExternalInputModal-table":"_ExternalInputModal-table_143vl_173","ExternalInputModal-thead":"_ExternalInputModal-thead_143vl_189","ExternalInputModal-th":"_ExternalInputModal-th_143vl_189","ExternalInputModal-td":"_ExternalInputModal-td_143vl_204","ExternalInputModal-tr":"_ExternalInputModal-tr_143vl_210","ExternalInputModal-tbody":"_ExternalInputModal-tbody_143vl_217","ExternalInputModal--hasData":"_ExternalInputModal--hasData_143vl_244","ExternalInputModal-loadingBanner":"_ExternalInputModal-loadingBanner_143vl_248","ExternalInputModal--isLoading":"_ExternalInputModal--isLoading_143vl_265","ExternalInputModal-searchForm":"_ExternalInputModal-searchForm_143vl_269","ExternalInputModal-search":"_ExternalInputModal-search_143vl_269","ExternalInputModal-searchIcon":"_ExternalInputModal-searchIcon_143vl_306","ExternalInputModal-searchIconText":"_ExternalInputModal-searchIconText_143vl_333","ExternalInputModal-searchInput":"_ExternalInputModal-searchInput_143vl_343","ExternalInputModal-searchActions":"_ExternalInputModal-searchActions_143vl_358","ExternalInputModal-searchActionIcon":"_ExternalInputModal-searchActionIcon_143vl_371","ExternalInputModal-footerContainer":"_ExternalInputModal-footerContainer_143vl_375","ExternalInputModal-footer":"_ExternalInputModal-footer_143vl_375","ExternalInputModal-field":"_ExternalInputModal-field_143vl_388"};(0,cR.init_react_import)(),(0,cR.init_react_import)();var jW=(0,cA.get_class_name_factory_default)("Modal",{Modal:"_Modal_g5xob_1","Modal--isOpen":"_Modal--isOpen_g5xob_15","Modal-inner":"_Modal-inner_g5xob_19"}),jX=({children:a,onClose:b,isOpen:c})=>{let[d,e]=(0,cv.useState)(null);return((0,cv.useEffect)(()=>{e(document.getElementById("puck-portal-root"))},[]),d)?(0,hr.createPortal)((0,cS.jsx)("div",{className:jW({isOpen:c}),onClick:b,children:(0,cS.jsx)("div",{className:jW("inner"),onClick:a=>a.stopPropagation(),children:a})}),d):(0,cS.jsx)("div",{})};(0,cR.init_react_import)(),(0,cR.init_react_import)();var jY=(0,cA.get_class_name_factory_default)("Heading",{Heading:"_Heading_97eh4_1","Heading--xxxxl":"_Heading--xxxxl_97eh4_12","Heading--xxxl":"_Heading--xxxl_97eh4_18","Heading--xxl":"_Heading--xxl_97eh4_22","Heading--xl":"_Heading--xl_97eh4_26","Heading--l":"_Heading--l_97eh4_30","Heading--m":"_Heading--m_97eh4_34","Heading--s":"_Heading--s_97eh4_38","Heading--xs":"_Heading--xs_97eh4_42"}),jZ=({children:a,rank:b,size:c="m"})=>{let d=b?`h${b}`:"span";return(0,cS.jsx)(d,{className:jY({[c]:!0}),children:a})};(0,cR.init_react_import)();var j$=(0,cA.get_class_name_factory_default)("ExternalInput",jV),j_=(0,cA.get_class_name_factory_default)("ExternalInputModal",jV),j0=({count:a})=>{let b=(0,cP.useMessage)("field-external-result-singular",{count:a}),c=(0,cP.useMessage)("field-external-result-plural",{count:a});return(0,cS.jsx)("span",{className:j_("footer"),children:1===a?b:c})},j1={},j2=({field:a,onChange:b,value:c=null,name:d,id:e,readOnly:f})=>{var g;let{mapProp:h=a=>a,mapRow:i=a=>a,filterFields:j}=a||{},{enabled:k}=null!=(g=a.cache)?g:{enabled:!0},[l,m]=(0,cv.useState)([]),[n,o]=(0,cv.useState)(!1),[p,q]=(0,cv.useState)(!0),r=!!j,[s,t]=(0,cv.useState)(a.initialFilters||{}),[u,v]=(0,cv.useState)(r),w=(0,cv.useMemo)(()=>l.map(i),[l]),y=(0,cv.useMemo)(()=>{let a=new Set;for(let b of w)for(let c of Object.keys(b))("string"==typeof b[c]||"number"==typeof b[c]||(0,cv.isValidElement)(b[c]))&&a.add(c);return Array.from(a)},[w]),[z,A]=(0,cv.useState)(a.initialQuery||""),B=(0,cv.useCallback)((b,c)=>(0,cR.__async)(null,null,function*(){let d;q(!0);let f=`${e}-${b}-${JSON.stringify(c)}`;(d=k&&j1[f]?j1[f]:yield a.fetchList({query:b,filters:c}))&&(m(d),q(!1),k&&(j1[f]=d))}),[e,a]),C=(0,cv.useCallback)(b=>a.renderFooter?a.renderFooter(b):(0,cS.jsx)(j0,{count:b.items.length}),[a.renderFooter]);(0,cv.useEffect)(()=>{B(z,s)},[]);let D=(0,cP.useMessage)("field-external-item"),E=(0,cP.useMessage)("field-external-search"),F=(0,cP.useMessage)("field-external-togglefilters"),G=(0,cP.useMessage)("field-external-selectdata");return(0,cS.jsxs)("div",{className:j$({dataSelected:!!c,modalVisible:n,readOnly:f}),id:e,children:[(0,cS.jsxs)("div",{className:j$("actions"),children:[(0,cS.jsx)("button",{type:"button",onClick:()=>o(!0),className:j$("button"),disabled:f,children:c?a.getItemSummary?a.getItemSummary(c):D:(0,cS.jsxs)(cS.Fragment,{children:[(0,cS.jsx)(cP.Link,{size:"16"}),(0,cS.jsx)("span",{children:a.placeholder})]})}),c&&(0,cS.jsx)("button",{type:"button",className:j$("detachButton"),onClick:()=>{b(null)},disabled:f,children:(0,cS.jsx)(cP.LockOpen,{size:16})})]}),(0,cS.jsx)(jX,{onClose:()=>o(!1),isOpen:n,children:(0,cS.jsxs)("form",{className:j_({isLoading:p,loaded:!p,hasData:w.length>0,filtersToggled:u}),onSubmit:a=>{a.preventDefault(),a.stopPropagation(),B(z,s)},children:[(0,cS.jsx)("div",{className:j_("masthead"),children:a.showSearch?(0,cS.jsxs)("div",{className:j_("searchForm"),children:[(0,cS.jsxs)("label",{className:j_("search"),children:[(0,cS.jsx)("span",{className:j_("searchIconText"),children:E}),(0,cS.jsx)("div",{className:j_("searchIcon"),children:(0,cS.jsx)(cP.Search,{size:"18"})}),(0,cS.jsx)("input",{className:j_("searchInput"),name:"q",type:"search",placeholder:a.placeholder,onChange:a=>{A(a.currentTarget.value)},autoComplete:"off",value:z})]}),(0,cS.jsxs)("div",{className:j_("searchActions"),children:[(0,cS.jsx)(jf,{type:"submit",loading:p,fullWidth:!0,children:E}),r&&(0,cS.jsx)("div",{className:j_("searchActionIcon"),children:(0,cS.jsx)(cP.IconButton,{type:"button",title:F,onClick:a=>{a.preventDefault(),a.stopPropagation(),v(!u)},children:(0,cS.jsx)(cP.SlidersHorizontal,{size:20})})})]})]}):(0,cS.jsx)(jZ,{rank:"2",size:"xs",children:a.placeholder||G})}),(0,cS.jsxs)("div",{className:j_("grid"),children:[r&&(0,cS.jsx)("div",{className:j_("filters"),children:r&&Object.keys(j).map(a=>{let b=j[a];return(0,cS.jsx)("div",{className:j_("field"),children:(0,cS.jsx)(ji,{label:b.label||a,children:(0,cS.jsx)(kg,{field:b,id:`external_field_${a}_filter`,value:s[a],onChange:b=>{t(c=>{let d=(0,cR.__spreadProps)((0,cR.__spreadValues)({},c),{[a]:b});return B(z,d),d})}})})},a)})}),(0,cS.jsxs)("div",{className:j_("tableWrapper"),children:[(0,cS.jsxs)("table",{className:j_("table"),children:[(0,cS.jsx)("thead",{className:j_("thead"),children:(0,cS.jsx)("tr",{className:j_("tr"),children:y.map(a=>(0,cS.jsx)("th",{className:j_("th"),style:{textAlign:"left"},children:a},a))})}),(0,cS.jsx)("tbody",{className:j_("tbody"),children:w.map((a,c)=>(0,cS.jsx)("tr",{style:{whiteSpace:"nowrap"},className:j_("tr"),onClick:()=>{b(h(l[c])),o(!1)},children:y.map(b=>(0,cS.jsx)("td",{className:j_("td"),children:a[b]},b))},c))})]}),(0,cS.jsx)("div",{className:j_("loadingBanner"),children:(0,cS.jsx)(cP.Loader,{size:24})})]})]}),(0,cS.jsx)("div",{className:j_("footerContainer"),children:(0,cS.jsx)(C,{items:w})})]})})]})};(0,cR.init_react_import)();var j3=(0,cA.get_class_name_factory_default)("Input",jg);(0,cR.init_react_import)();var j4=(0,cA.get_class_name_factory_default)("Input",jg);(0,cR.init_react_import)();var j5=(0,cA.get_class_name_factory_default)("Input",jg);(0,cR.init_react_import)(),(0,cR.init_react_import)();var j6=(0,cv.memo)(a=>{var b;return(0,cS.jsx)(cx.EditorInner,(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{editor:null,menu:(0,cS.jsx)(cO.LoadedRichTextMenuInner,{field:a.field,editor:null,editorState:null,readOnly:null!=(b=a.readOnly)&&b}),children:(0,cS.jsx)("div",{className:"rich-text",dangerouslySetInnerHTML:{__html:a.content},contentEditable:!0})}))});j6.displayName="EditorFallback";var j7=(0,cv.lazy)(()=>a.A(272383).then(a=>({default:a.Editor})));(0,cR.init_react_import)(),(0,cR.init_react_import)();var j8=(0,cA.get_class_name_factory_default)("ObjectField",{ObjectField:"_ObjectField_c5reb_1","ObjectField-fieldset":"_ObjectField-fieldset_c5reb_10"});(0,cR.init_react_import)();var j9=()=>{if(void 0!==cv.default.useId)return cv.default.useId();let[a]=(0,cv.useState)((0,cQ.generateId)());return a},ka=(0,cA.get_class_name_factory_default)("Input",jg),kb=(0,cA.get_class_name_factory_default)("InputWrapper",jg),kc={array:({field:a,onChange:b,id:c,name:d=c,label:e,labelIcon:f,readOnly:g,Label:h=a=>(0,cS.jsx)("div",(0,cR.__spreadValues)({},a))})=>{let i=(0,cP.useAppStore)(a=>a.setUi),j=(0,cP.useAppStoreApi)(),k=jn(),{localName:l=d}=jJ(),m=()=>{var a;return null!=(a=jL(k.getState(),d))?a:[]},n=(0,cv.useCallback)(()=>{var a;let{state:b}=j.getState(),d=b.ui.arrayState[c];return(null==(a=null==d?void 0:d.items)?void 0:a.length)?d:{items:Array.from(m()||[]).map((a,b)=>({_originalIndex:b,_currentIndex:b,_arrayId:`${c}-${b}`})),openId:""}},[j,c,m,d]),o=jo(()=>m().length),p=(0,cv.useMemo)(n,[n]),q=(0,cP.useAppStore)(a=>{let b=a.state.ui.arrayState[c];return null!=b?b:p}),r=(0,cP.useAppStoreApi)(),s=(0,cv.useCallback)(a=>{let b=r.getState().state;return{arrayState:(0,cR.__spreadProps)((0,cR.__spreadValues)({},b.ui.arrayState),{[c]:(0,cR.__spreadValues)((0,cR.__spreadValues)({},n()),a)})}},[r]),t=(0,cv.useCallback)(()=>n().items.reduce((a,b)=>b._originalIndex>a?b._originalIndex:a,-1),[]),u=(0,cv.useCallback)(a=>{let b=t(),d=n(),e=Array.from(a||[]).map((a,e)=>{var f,g,h;let i=d.items[e],j={_originalIndex:null!=(f=null==i?void 0:i._originalIndex)?f:b+1,_currentIndex:null!=(g=null==i?void 0:i._currentIndex)?g:e,_arrayId:(null==(h=d.items[e])?void 0:h._arrayId)||`${c}-${b+1}`};return j._originalIndex>b&&(b=j._originalIndex),j});return(0,cR.__spreadProps)((0,cR.__spreadValues)({},d),{items:e})},[]),[v,w]=(0,cv.useState)(""),y=!!v,z=(0,cv.useRef)([]);(0,cv.useEffect)(()=>{z.current=m()},[]);let A=(0,cv.useCallback)(b=>{if("array"!==a.type||!a.arrayFields)return;let c=r.getState().config;return(0,cB.walkField)({value:b,fields:a.arrayFields,mappers:{slot:({value:a})=>a.map(a=>(0,cQ.populateIds)(a,c,!0))},config:c})},[r,a]),B=(0,cv.useCallback)(()=>{let a=n(),b=a.items.map((a,b)=>(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{_currentIndex:b})),d=r.getState().state;i({arrayState:(0,cR.__spreadProps)((0,cR.__spreadValues)({},d.ui.arrayState),{[c]:(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{items:b})})},!1)},[]),C=(0,cv.useCallback)(a=>{i(s(u(a)),!1),b(a)},[u,i,s,b]);(0,cv.useEffect)(()=>{i(s(u(m())),!1)},[o]);let D=(0,cP.useMessage)("field-arrayitem-duplicate"),E=(0,cP.useMessage)("field-arrayitem-delete");if("array"!==a.type||!a.arrayFields)return null;let F=void 0!==a.max&&(null==q?void 0:q.items.length)>=a.max||g;return(0,cS.jsx)(h,{label:e||d,icon:f||(0,cS.jsx)(cP.List,{size:16}),el:"div",readOnly:g,children:(0,cS.jsx)(jG,{onDragStart:a=>{z.current=m(),w(a),B()},onDragEnd:()=>{w(""),b(z.current);let a=k.getState();k.setState(jc(a,d,z.current)),B()},onMove:a=>{let b=n();if(b.items[a.source]._arrayId!==v)return;let d=(0,cP.reorder)(z.current,a.source,a.target),e=(0,cP.reorder)(b.items,a.source,a.target),f=r.getState().state;i({arrayState:(0,cR.__spreadProps)((0,cR.__spreadValues)({},f.ui.arrayState),{[c]:(0,cR.__spreadProps)((0,cR.__spreadValues)({},b),{items:e})})},!1),z.current=d},children:(0,cS.jsxs)("div",{className:jN({hasItems:o>0,addDisabled:F}),children:[q.items.length>0&&(0,cS.jsx)("div",{className:jN("inner"),"data-dnd-container":!0,children:q.items.map((e,f)=>{let{_arrayId:h=`${c}-${f}`,_originalIndex:j=f,_currentIndex:k=f}=e;return(0,cS.jsx)(jQ,{index:k,dragIndex:f,originalIndex:j,arrayId:c,id:h,readOnly:g,field:a,name:d,localName:l,onChange:(a,c,d)=>{let e=m(),g=Array.from(e||[])[f]||{};b((0,cP.replace)(e,f,(0,cR.__spreadProps)((0,cR.__spreadValues)({},g),{[d]:a})),c)},onToggleExpand:(a,b)=>{b?i(s({openId:""})):i(s({openId:a}))},actions:(0,cS.jsxs)(cS.Fragment,{children:[(0,cS.jsx)("div",{className:jO("action"),children:(0,cS.jsx)(cP.IconButton,{type:"button",disabled:!!F,onClick:a=>{a.stopPropagation();let b=[...m()||[]],c=A(b[f]);b.splice(f,0,c),C(b)},title:D,children:(0,cS.jsx)(cP.Copy,{size:16})})}),(0,cS.jsx)("div",{className:jO("action"),children:(0,cS.jsx)(cP.IconButton,{type:"button",disabled:void 0!==a.min&&a.min>=q.items.length,onClick:a=>{a.stopPropagation();let b=[...m()||[]];b.splice(f,1),C(b)},title:E,children:(0,cS.jsx)(cP.Trash,{size:16})})})]})},h)})}),!F&&(0,cS.jsx)("button",{type:"button",className:jN("addButton"),onClick:()=>{var b;if(y)return;let c=m()||[],d="function"==typeof a.defaultItemProps?a.defaultItemProps(c.length):null!=(b=a.defaultItemProps)?b:{};C([...c,(0,cB.defaultSlots)(A(d),a.arrayFields)])},children:(0,cS.jsx)(cP.Plus,{size:21})})]})})})},external:({field:a,onChange:b,id:c,name:d=c,label:e,labelIcon:f,Label:g,readOnly:h})=>{var i,j,k;let l=jR(d),m=(0,cP.useMessage)("field-external-selectdata");return((0,cv.useEffect)(()=>{a.adaptor&&console.error("Warning: The `adaptor` API is deprecated. Please use updated APIs on the `external` field instead. This will be a breaking change in a future release.")},[]),"external"!==a.type)?null:(0,cS.jsx)(g,{label:e||d,icon:f||(0,cS.jsx)(cP.Link,{size:16}),el:"div",children:(0,cS.jsx)(j2,{name:d,field:(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{placeholder:(null==(i=a.adaptor)?void 0:i.name)?`Select from ${a.adaptor.name}`:a.placeholder||m,mapProp:(null==(j=a.adaptor)?void 0:j.mapProp)||a.mapProp,mapRow:a.mapRow,fetchList:(null==(k=a.adaptor)?void 0:k.fetchList)?()=>(0,cR.__async)(null,null,function*(){return yield a.adaptor.fetchList(a.adaptorParams)}):a.fetchList}),onChange:b,value:l,id:c,readOnly:h})})},object:({field:a,onChange:b,id:c,name:d=c,label:e,labelIcon:f,Label:g,readOnly:h})=>{let{localName:i=d}=jJ(),j=jn(),k=(0,cP.useAppStore)(a=>a.permissions.getPermissions({item:a.selectedItem}).edit);return"object"===a.type&&a.objectFields?(0,cS.jsx)(g,{label:e||d,icon:f||(0,cS.jsx)(cP.EllipsisVertical,{size:16}),el:"div",readOnly:h,children:(0,cS.jsx)("div",{className:j8(),children:(0,cS.jsx)("fieldset",{className:j8("fieldset"),children:Object.keys(a.objectFields).map(e=>{let f=a.objectFields[e],g=`${i}.${e}`;return(0,cS.jsx)(jM,{id:`${c}_${e}`,name:d,subName:e,localName:i,field:f,forceReadOnly:!k,onChange:(a,c,e)=>{var f;let g=null!=(f=jL(j.getState(),d))?f:{};g[e]!==a&&b((0,cR.__spreadProps)((0,cR.__spreadValues)({},g),{[e]:a}),c)}},g)})})})}):null},select:({field:a,onChange:b,label:c,labelIcon:d,Label:e,id:f,name:g=f,readOnly:h})=>{let i=jR(g);return"select"===a.type&&a.options?(0,cS.jsx)(e,{label:c||g,icon:d||(0,cS.jsx)(cP.ChevronDown,{size:16}),readOnly:h,children:(0,cS.jsxs)("div",{className:j4("select"),children:[(0,cS.jsx)("select",{id:f,title:c||g,className:j4("input"),disabled:h,onChange:a=>{b(JSON.parse(a.target.value).value)},value:JSON.stringify({value:i}),children:a.options.map(a=>(0,cS.jsx)("option",{label:a.label,value:JSON.stringify({value:a.value})},a.label+JSON.stringify(a.value)))}),(0,cS.jsx)(cP.ChevronDown,{size:18,className:j4("selectIcon")})]})}):null},textarea:({field:a,onChange:b,readOnly:c,id:d,name:e=d,label:f,labelIcon:g,Label:h})=>{let[i,j]=jS(e,b,{fallback:""});return(0,cS.jsx)(h,{label:f||e,icon:g||(0,cS.jsx)(cP.Type,{size:16}),readOnly:c,children:(0,cS.jsx)("textarea",{id:d,className:j5("input"),autoComplete:"off",name:e,value:i,onChange:a=>j(a.currentTarget.value),readOnly:c,tabIndex:c?-1:void 0,rows:5,placeholder:"textarea"===a.type?a.placeholder:void 0})})},radio:({field:a,onChange:b,readOnly:c,id:d,name:e=d,label:f,labelIcon:g,Label:h})=>{let i=jR(e);return"radio"===a.type&&a.options?(0,cS.jsx)(h,{icon:g||(0,cS.jsx)(cP.CircleCheckBig,{size:16}),label:f||e,readOnly:c,el:"div",children:(0,cS.jsx)("div",{className:j3("radioGroupItems"),id:d,children:a.options.map(a=>{var d;return(0,cS.jsxs)("label",{className:j3("radio"),children:[(0,cS.jsx)("input",{type:"radio",className:j3("radioInput"),value:JSON.stringify({value:a.value}),name:e,onChange:a=>{b(JSON.parse(a.target.value).value)},disabled:c,checked:i===a.value}),(0,cS.jsx)("div",{className:j3("radioInner"),children:a.label||(null==(d=a.value)?void 0:d.toString())})]},a.label+a.value)})})}):null},text:jU,number:jU,richtext:({onChange:a,readOnly:b=!1,id:c,name:d=c,label:e,labelIcon:f,Label:g,field:h})=>{let i={onChange:a,content:jR(d),readOnly:b,field:h,id:c,name:d};return(0,cS.jsx)(cS.Fragment,{children:(0,cS.jsx)(g,{label:e||d,icon:f||(0,cS.jsx)(cP.Type,{size:16}),readOnly:b,el:"div",children:(0,cS.jsx)(cv.Suspense,{fallback:(0,cS.jsx)(j6,(0,cR.__spreadValues)({},i)),children:(0,cS.jsx)(j7,(0,cR.__spreadValues)({},i))})})})}};function kd(a){var b,c,d;let e=(0,cP.useAppStore)(a=>a.dispatch),f=(0,cP.useAppStore)(a=>a.overrides),g=(0,cP.useAppStore)(cU(a=>{var b;return null==(b=a.selectedItem)?void 0:b.readOnly})),h=(0,cv.useContext)(jI),{id:i,Label:j=jj}=a,k=a.field,l=k.label,m=k.labelIcon,n=j9(),o=i||n,p=(0,cv.useMemo)(()=>{var a,b,c,d,e,g,h,i,j,k;return(0,cR.__spreadProps)((0,cR.__spreadValues)({},f.fieldTypes),{custom:null==(a=f.fieldTypes)?void 0:a.custom,array:(null==(b=f.fieldTypes)?void 0:b.array)||kc.array,external:(null==(c=f.fieldTypes)?void 0:c.external)||kc.external,object:(null==(d=f.fieldTypes)?void 0:d.object)||kc.object,select:(null==(e=f.fieldTypes)?void 0:e.select)||kc.select,textarea:(null==(g=f.fieldTypes)?void 0:g.textarea)||kc.textarea,radio:(null==(h=f.fieldTypes)?void 0:h.radio)||kc.radio,text:(null==(i=f.fieldTypes)?void 0:i.text)||kc.text,number:(null==(j=f.fieldTypes)?void 0:j.number)||kc.number,richtext:(null==(k=f.fieldTypes)?void 0:k.richtext)||kc.richtext})},[f]),q="custom"===k.type||!!(null==(b=f.fieldTypes)?void 0:b[k.type]),r=null!=(c=a.name)?c:o,s=jn(),t=(0,cv.useMemo)(()=>q?(b,c)=>{var d;null==(d=a.onChange)||d.call(a,b,c),s.setState(jc(s.getState(),r,b))}:a.onChange,[q,a.onChange,r,s]),[u,v]=jS(r,t,{tracked:q}),w=(0,cv.useMemo)(()=>(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{field:k,label:l,labelIcon:m,Label:j,id:o,value:u,onChange:v}),[a,k,l,m,j,o,u,v]),y=(0,cv.useCallback)(a=>{w.name&&("INPUT"===a.target.nodeName||"TEXTAREA"===a.target.nodeName)&&(a.stopPropagation(),e({type:"setUi",ui:{field:{focus:w.name}}}))},[w.name]),z=(0,cv.useCallback)(a=>{"name"in a.target&&e({type:"setUi",ui:{field:{focus:null}}})},[]),A=(0,cv.useMemo)(()=>"custom"!==k.type&&"slot"!==k.type?kc[k.type]:a=>null,[k.type]),B="custom"===k.type?k.key:void 0,C=(0,cv.useMemo)(()=>"custom"!==k.type||p[k.type]?"slot"!==k.type?p[k.type]:void 0:k.render?k.render:null,[k.type,B,p]),{visible:D=!0}=a.field;if(!D||"slot"===k.type)return null;if(!C)throw Error(`Field type for ${k.type} did not exist.`);return(0,cS.jsx)(jI.Provider,{value:{readOnlyFields:h.readOnlyFields||g||{},localName:null!=(d=h.localName)?d:w.name},children:(0,cS.jsx)("div",{className:kb(),onFocus:y,onBlur:z,onClick:a=>{a.stopPropagation()},children:(0,cS.jsx)(C,(0,cR.__spreadProps)((0,cR.__spreadValues)({},w),{children:(0,cS.jsx)(A,(0,cR.__spreadValues)({},w))}))})})}function ke(a){return(0,cS.jsx)(kd,(0,cR.__spreadValues)({},a))}function kf(a){var{value:b}=a,c=(0,cR.__objRest)(a,["value"]);let d=(0,cv.useMemo)(()=>a=>(0,cS.jsx)("div",(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{className:ka({readOnly:c.readOnly})})),[c.readOnly]),e=jn(),f=(0,cv.useCallback)(a=>{c.id&&(e.setState({[c.id]:a}),c.onChange(a))},[e,c.onChange,c.id]);return(0,cv.useEffect)(()=>{c.id&&e.setState({[c.id]:b})},[c.id,b,e]),(0,cS.jsx)(kd,(0,cR.__spreadProps)((0,cR.__spreadValues)({},c),{onChange:f,Label:d}))}function kg(a){let b=j9();return"slot"===a.field.type?null:(0,cS.jsx)(jm.Provider,{value:{[b]:a.value},children:(0,cS.jsx)(kf,(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{id:b}))})}function kh(a){let b={x:0,y:0},c=a;for(;c&&c!==document.documentElement;){let a=c.parentElement;a&&(b.x+=a.scrollLeft,b.y+=a.scrollTop),c=a}return b}(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var ki=(0,cv.createContext)(null),kj=(0,cv.createContext)((0,cV.createStore)(()=>({zoneDepthIndex:{},nextZoneDepthIndex:{},areaDepthIndex:{},nextAreaDepthIndex:{},draggedItem:null,previewIndex:{},enabledIndex:{},hoveringComponent:null,registerRootVirtualizer:()=>{},unregisterRootVirtualizer:()=>{},scrollToComponent:()=>!1}))),kk=({children:a,store:b})=>(0,cS.jsx)(kj.Provider,{value:b,children:a}),kl=({children:a,value:b})=>{let c=(0,cP.useAppStore)(a=>a.dispatch),d=(0,cv.useCallback)(a=>{c({type:"registerZone",zone:a})},[c]),e=(0,cv.useMemo)(()=>(0,cR.__spreadValues)({registerZone:d},b),[b]);return(0,cS.jsx)(cS.Fragment,{children:e&&(0,cS.jsx)(ki.Provider,{value:e,children:a})})};(0,cR.init_react_import)();var km=(a,b=[])=>{let c=(0,cP.useAppStoreApi)();return(0,cv.useCallback)(()=>{let b=()=>{},d=c=>{c?a(!1):(setTimeout(()=>{a(!0)},0),b&&b())},e=c.getState().state.ui.isDragging;return d(e),e&&(b=c.subscribe(a=>a.state.ui.isDragging,a=>{d(a)})),b},[c,...b])};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var kn=()=>{};(0,cR.init_react_import)(),(0,cR.init_react_import)();var ko=a=>"u">typeof CSS&&"function"==typeof CSS.escape?CSS.escape(a):a,kp=a=>`[data-puck-component="${ko(a)}"]`,kq=a=>`[data-puck-dropzone="${ko(a)}"]`,kr={duration:250,easing:"ease"},ks=a=>{var b,c;return null!=(c=null==(b=a.defaultView)?void 0:b.matchMedia("(prefers-reduced-motion: reduce)").matches)&&c},kt=(a,{zones:b,itemId:c,targetZone:d,getExpectedOrder:e,initialExpectedOrder:f=[]},g)=>{let h=new Set(f),i=0,j=()=>{var f;let k=a.querySelector(kq(d)),l=e(),m=null!=c?c:l.find(a=>!h.has(a)),n=m&&null!=(f=null==k?void 0:k.querySelector(`:scope > ${kp(m)}:not([data-dnd-dragging]):not([data-dnd-placeholder])`))?f:null,o=k?Array.from(k.querySelectorAll(":scope > [data-puck-component]:not([data-dnd-dragging]):not([data-dnd-placeholder])")).map(a=>a.getAttribute("data-puck-component")):[],p=new Set(o),q=l.filter(a=>p.has(a)),r=o.length===q.length&&o.every((a,b)=>a===q[b]),s=b.every(b=>b===d||!m||!a.querySelector(`${kq(b)} > ${kp(m)}`));if((!n||!r||!s)&&i<10){i++,requestAnimationFrame(j);return}g(n)};requestAnimationFrame(j)};(0,cR.init_react_import)();var ku=(a,b)=>{var c,d;return null!=(d=null==(c=a.indexes.zones[b])?void 0:c.contentIds)?d:[]},kv=(a,b)=>{let c=(0,cP.useAppStoreApi)();return(0,cv.useCallback)(d=>{var e,f,g,h,i;let j,k=Object.values(null!=(e=a.getState().previewIndex)?e:{}),l=b?k.find(a=>(null==a?void 0:a.props.id)===b&&!a.ghost):k.find(a=>(null==a?void 0:a.type)==="insert"),m=b?(null==l?void 0:l.linePlaceholder)||(null==l?void 0:l.type)==="insert":!!l;return f=l&&m?{itemId:"move"===l.type?b:void 0,targetZone:l.zone,getExpectedOrder:()=>ku(c.getState().state,l.zone)}:void 0,!(null!=(h=null==(j=null==(g=d.source.manager)?void 0:g.dragOperation)?void 0:j.canceled)&&h||(null==(i=null==j?void 0:j.target)?void 0:i.type)==="void")&&f?void(({feedbackElement:a,itemId:b,targetZone:c,getExpectedOrder:d})=>{var e;let f=a.ownerDocument,g=null!=(e=kn())?e:f;if(ks(f))return;let h=a.getBoundingClientRect(),i=d(),j=a.cloneNode(!0);j.removeAttribute("id"),j.removeAttribute("popover"),j.removeAttribute("data-puck-component"),j.removeAttribute("data-puck-dnd"),j.removeAttribute("data-dnd-dragging"),j.setAttribute("inert","true"),Object.assign(j.style,{position:"fixed",left:`${h.left}px`,top:`${h.top}px`,width:`${h.width}px`,height:`${h.height}px`,margin:"0",overflow:"hidden",pointerEvents:"none",transform:"none",transition:"none",translate:"none",zIndex:"2147483647"});let k=g.createElement("style");k.textContent=`
    ${b?`${kp(b)} { visibility: hidden !important; }`:""}
    [data-puck-overlay] { opacity: 0 !important; }
  `,g.head.appendChild(k),f.body.appendChild(j);let l=()=>{j.remove(),k.remove()};kt(g,{zones:[c],itemId:b,targetZone:c,getExpectedOrder:d,initialExpectedOrder:i},a=>{if(!a)return void l();let c=a.getAttribute("data-puck-component");!b&&c&&(k.textContent+=`
          ${kp(c)} { visibility: hidden !important; }
        `);let d=((a,b)=>{var c,d;let e=a.getBoundingClientRect();if(a.ownerDocument===b)return e;let f=((a,b)=>{var c,d;let e={x:0,y:0,scaleX:1,scaleY:1},f=null==(c=a.ownerDocument.defaultView)?void 0:c.frameElement;for(;f&&f!==b;){let a=f.getBoundingClientRect(),b=f.offsetWidth?a.width/f.offsetWidth:1,c=f.offsetHeight?a.height/f.offsetHeight:1;e.x+=a.left,e.y+=a.top,e.scaleX*=b,e.scaleY*=c,f=null==(d=f.ownerDocument.defaultView)?void 0:d.frameElement}return e})(a,null!=(d=null==(c=b.defaultView)?void 0:c.frameElement)?d:null);return{left:e.left*f.scaleX+f.x,top:e.top*f.scaleY+f.y,width:e.width*f.scaleX,height:e.height*f.scaleY}})(a,f);j.animate({left:[`${h.left}px`,`${d.left}px`],top:[`${h.top}px`,`${d.top}px`],width:[`${h.width}px`,`${d.width}px`],height:[`${h.height}px`,`${d.height}px`]},(0,cR.__spreadProps)((0,cR.__spreadValues)({},kr),{fill:"forwards"})).finished.catch(()=>void 0).then(l)})})((0,cR.__spreadProps)((0,cR.__spreadValues)({},f),{feedbackElement:d.feedbackElement})):(({element:a,feedbackElement:b,placeholder:c,translate:d})=>{var e;if(ks(b.ownerDocument))return;let f=null!=c?c:a,g={frameTransform:b.ownerDocument===f.ownerDocument?null:void 0},h=new f6(b,g),i=new f6(f,g),j=null!=(e=fW(fR(b).translate))?e:d,k={x:j.x-(h.center.x-i.center.x),y:j.y-(h.center.y-i.center.y)};return b.setAttribute("data-dnd-dropping",""),b.animate({translate:[`${j.x}px ${j.y}px 0`,`${k.x}px ${k.y}px 0`]},kr).finished.catch(()=>void 0).then(()=>{b.removeAttribute("data-dnd-dropping")})})(d)},[c,a,b])};function kw(a,b){a.forEach(a=>{"function"==typeof a?a(b):a&&"object"==typeof a&&"current"in a&&(a.current=b)})}(0,cR.init_react_import)();var kx=(0,cA.get_class_name_factory_default)("DraggableComponent",{DraggableComponent:"_DraggableComponent_1627v_1","DraggableComponent-overlayWrapper":"_DraggableComponent-overlayWrapper_1627v_6","DraggableComponent-overlay":"_DraggableComponent-overlay_1627v_6","DraggableComponent-loadingOverlay":"_DraggableComponent-loadingOverlay_1627v_38","DraggableComponent--hover":"_DraggableComponent--hover_1627v_54","DraggableComponent--isSelected":"_DraggableComponent--isSelected_1627v_72","DraggableComponent-actionsOverlay":"_DraggableComponent-actionsOverlay_1627v_89","DraggableComponent-actions":"_DraggableComponent-actions_1627v_89","DraggableComponent-actionsAction":"_DraggableComponent-actionsAction_1627v_111"}),ky=({label:a,children:b,parentAction:c})=>(0,cS.jsxs)(cP.ActionBar,{children:[(0,cS.jsxs)(cP.ActionBar.Group,{children:[c,a&&(0,cS.jsx)(cP.ActionBar.Label,{label:a})]}),(0,cS.jsx)(cP.ActionBar.Group,{children:b})]}),kz=({children:a})=>(0,cS.jsx)(cS.Fragment,{children:a}),kA=({children:a,depth:b,componentType:c,id:d,index:e,zoneCompound:f,isLoading:g=!1,isSelected:h=!1,debug:i,label:j,autoDragAxis:k,userDragAxis:l,inDroppableZone:m=!0,itemRef:n})=>{let o=(0,cP.useAppStore)(a=>{var b;return(null==(b=a.selectedItem)?void 0:b.props.id)===d?a.zoomConfig.zoom:1}),p=(0,cP.useAppStore)(a=>a._experimentalFullScreenCanvas),q=(0,cP.useAppStore)(a=>a.overrides),r=(0,cP.useAppStore)(a=>a.dispatch),s=(0,cP.useAppStore)(a=>a.iframe),t=(0,cv.useRef)(0),u=(0,cv.useContext)(ki),[v,w]=(0,cv.useState)({}),y=(0,cv.useCallback)((a,b)=>{var c;null==(c=null==u?void 0:u.registerLocalZone)||c.call(u,a,b),w(c=>(0,cR.__spreadProps)((0,cR.__spreadValues)({},c),{[a]:b}))},[w]),z=(0,cv.useCallback)(a=>{var b;null==(b=null==u?void 0:u.unregisterLocalZone)||b.call(u,a),w(b=>{let c=(0,cR.__spreadValues)({},b);return delete c[a],c})},[w]),A=Object.values(v).filter(Boolean).length>0,B=(0,cP.useAppStore)(cU(a=>{var b;return null==(b=a.state.indexes.nodes[d])?void 0:b.path})),C=(0,cP.useAppStore)(cU(a=>{let b=(0,cQ.getItem)({index:e,zone:f},a.state);return a.permissions.getPermissions({item:b})})),D=(0,cv.useContext)(kj),E=(0,cP.useAppStoreApi)(),[F,G]=(0,cv.useState)(l||k),H=(0,cv.useMemo)(()=>jD(F),[F]),I=kv(D,d),{ref:J,isDragging:K,sortable:L}=iS({id:d,index:e,group:f,type:"component",data:{areaId:null==u?void 0:u.areaId,zone:f,index:e,componentType:c,containsActiveZone:A,depth:b,path:B||[],inDroppableZone:m},collisionPriority:b,collisionDetector:H,transition:{duration:200,easing:"cubic-bezier(0.2, 0, 0, 1)"},plugins:a=>[...a,gY.configure({feedback:"clone",dropAnimation:I})]});(0,cv.useEffect)(()=>{let a=D.getState().enabledIndex[f];L.droppable.disabled=!a,L.draggable.disabled=!C.drag;let b=D.subscribe(a=>{L.droppable.disabled=!a.enabledIndex[f]});return N.current&&!C.drag?(N.current.setAttribute("data-puck-disabled",""),()=>{var a;null==(a=N.current)||a.removeAttribute("data-puck-disabled"),b()}):b},[C.drag,f]);let[,M]=(0,cv.useState)(0),N=(0,cv.useRef)(null),O=(0,cv.useCallback)(a=>{J(a),N.current!==a&&(N.current=a,M(a=>a+1),n&&kw([n],a))},[n,J]),[P,Q]=(0,cv.useState)();(0,cv.useEffect)(()=>{var a,b,c;Q(s.enabled?null==(a=N.current)?void 0:a.ownerDocument.body:null!=(c=null==(b=N.current)?void 0:b.closest("[data-puck-preview]"))?c:document.body)},[s.enabled]);let R=(0,cv.useCallback)(()=>{var a,b;if(!N.current)return;let c=N.current,d=c.getBoundingClientRect(),e=s.enabled?null:c.closest("[data-puck-preview]"),f=(()=>{let a=c;for(;a&&a!==document.documentElement;){if("fixed"===getComputedStyle(a).position)return!0;a=a.parentElement}return!1})(),g=null==e?void 0:e.getBoundingClientRect(),h=e?kh(e):{x:0,y:0},i=f?{x:0,y:0}:kh(c),j=f?{x:0,y:0}:{x:i.x-h.x-(null!=(a=null==g?void 0:g.left)?a:0),y:i.y-h.y-(null!=(b=null==g?void 0:g.top)?b:0)};return{left:`${d.left+j.x}px`,top:`${d.top+j.y}px`,height:`${d.height}px`,width:`${d.width}px`,position:f?"fixed":void 0}},[s.enabled]),[S,T]=(0,cv.useState)(),U=(0,cv.useRef)(null),V=(0,cv.useRef)(null),W=(0,cv.useCallback)(()=>{T(R()),n&&kw([n],N.current)},[R,n]),X=(0,cv.useCallback)(()=>{null==V.current&&(V.current=requestAnimationFrame(()=>{V.current=null,W()}))},[W]);(0,cv.useEffect)(()=>()=>{null!=V.current&&(cancelAnimationFrame(V.current),V.current=null)},[]),(0,cv.useEffect)(()=>{if(N.current){let a=new ResizeObserver(()=>{X()});return a.observe(N.current),()=>{a.disconnect()}}},[X,n]);let Y=(0,cP.useAppStore)(a=>a.nodes.registerNode),Z=(0,cP.useAppStore)(a=>a.nodes.unregisterNode),$=(0,cv.useCallback)(()=>{al(!1)},[]),_=(0,cv.useCallback)(()=>{al(!0)},[]),aa=(0,cv.useRef)({sync:()=>null,hideOverlay:()=>null,showOverlay:()=>null});(0,cv.useLayoutEffect)(()=>{aa.current.sync=W,aa.current.hideOverlay=$,aa.current.showOverlay=_},[$,_,W]),(0,cv.useEffect)(()=>(Y(d,aa.current),()=>{Z(d)}),[d,Y,Z]);let ab=(0,cv.useMemo)(()=>q.actionBar||ky,[q.actionBar]),ac=(0,cv.useMemo)(()=>q.componentOverlay||kz,[q.componentOverlay]),ad=(0,cv.useCallback)(a=>{D.getState().draggedItem||(a.target.closest("[data-puck-overlay-portal]")||a.stopPropagation(),p?r({type:"setUi",ui:{itemSelector:h?null:{index:e,zone:f}}}):r({type:"setUi",ui:{itemSelector:{index:e,zone:f}}}))},[e,f,d,h,p]),ae=(0,cv.useCallback)(()=>{let{nodes:a,zones:b}=E.getState().state.indexes,c=a[d],e=(null==c?void 0:c.parentId)?a[null==c?void 0:c.parentId]:null;if(!e||!c.parentId)return;let f=`${e.parentId}:${e.zone}`,g=b[f].contentIds.indexOf(c.parentId);r({type:"setUi",ui:{itemSelector:{zone:f,index:g}}})},[u,B]),af=(0,cv.useCallback)(()=>{r({type:"duplicate",sourceIndex:e,sourceZone:f})},[e,f]),ag=(0,cv.useCallback)(()=>{r({type:"remove",index:e,zone:f})},[e,f]),[ah,ai]=(0,cv.useState)(!1),aj=jl(kj,a=>a.hoveringComponent===d);(0,cv.useEffect)(()=>{if(!N.current)return;let a=N.current,b=a=>{D.getState().draggedItem?K?ai(!0):ai(!1):ai(!0),a.stopPropagation()},c=a=>{a.stopPropagation(),ai(!1)};return a.setAttribute("data-puck-component",d),a.setAttribute("data-puck-dnd",d),a.style.position="relative",a.addEventListener("click",ad),a.addEventListener("mouseover",b),a.addEventListener("mouseout",c),()=>{a.removeAttribute("data-puck-component"),a.removeAttribute("data-puck-dnd"),a.removeEventListener("click",ad),a.removeEventListener("mouseover",b),a.removeEventListener("mouseout",c)}},[N.current,ad,A,f,d,K,m]);let[ak,al]=(0,cv.useState)(!1),[am,an]=(0,cv.useState)(!0),[ao,ap]=(0,cv.useTransition)();(0,cv.useEffect)(()=>{ap(()=>{ah||aj||h?(X(),al(!0),ar(!1)):al(!1)})},[ah,aj,h,s]);let[aq,ar]=(0,cv.useState)(!1),as=km(a=>{a?ap(()=>{W(),an(!0)}):an(!1)});(0,cv.useEffect)(()=>{K&&ar(!0)},[K]),(0,cv.useEffect)(()=>{if(aq)return as()},[aq,as]),(0,cv.useEffect)(()=>{if(!am||!(h||K))return;let a=N.current;if(!a)return;let b=a.ownerDocument,c=b.defaultView;if(!c)return;t.current=0,X();let d=()=>X(),e=()=>X();b.addEventListener("scroll",d,!0),c.addEventListener("resize",e);let f=0,g=a=>{if(a-t.current>=100){t.current=a;let b=N.current;if(b){let a=b.getBoundingClientRect(),c=U.current;(!c||Math.abs(a.x-c.x)>.5||Math.abs(a.y-c.y)>.5||Math.abs(a.width-c.width)>.5||Math.abs(a.height-c.height)>.5)&&(U.current=a,X())}}f=requestAnimationFrame(g)};return f=requestAnimationFrame(g),()=>{b.removeEventListener("scroll",d,!0),c.removeEventListener("resize",e),cancelAnimationFrame(f)}},[am,h,K,X]);let at=(0,cv.useCallback)(a=>{if(a&&a.ownerDocument.defaultView){let b=a.getBoundingClientRect(),c=b.x<0,d=b.y;c&&(a.style.transformOrigin="left top",a.style.left="0px"),d<0&&(a.style.top="12px",c||(a.style.transformOrigin="right top"))}},[o]),au=(0,cv.useRef)(null);(0,cv.useEffect)(()=>{at(au.current)},[au.current,at]),(0,cv.useEffect)(()=>{if(l)return void G(l);if(N.current){let a=window.getComputedStyle(N.current);if("inline"===a.display||"inline-block"===a.display)return void G("x")}G(k)},[N,l,k]);let av=(0,cP.useMessage)("action-selectparent"),aw=(0,cP.useMessage)("action-duplicate"),ax=(0,cP.useMessage)("action-delete"),ay=(0,cv.useMemo)(()=>(null==u?void 0:u.areaId)&&(null==u?void 0:u.areaId)!=="root"&&(0,cS.jsx)(cP.ActionBar.Action,{onClick:ae,label:av,children:(0,cS.jsx)(cP.CornerLeftUp,{size:16})}),[null==u?void 0:u.areaId,av]),az=(0,cv.useMemo)(()=>(0,cR.__spreadProps)((0,cR.__spreadValues)({},u),{areaId:d,zoneCompound:f,index:e,depth:b+1,registerLocalZone:y,unregisterLocalZone:z}),[u,d,f,e,b,y,z]),aA=(0,cP.useAppStore)(a=>{var b;return(null==(b=a.currentRichText)?void 0:b.inlineComponentId)===d?a.currentRichText:null}),aB=C.duplicate||C.delete;return(0,cS.jsxs)(kl,{value:az,children:[am&&ak&&(0,hr.createPortal)((0,cS.jsxs)("div",{className:kx({isSelected:h,isDragging:K,hover:ah||aj}),style:(0,cR.__spreadValues)({},S),"data-puck-overlay":!0,children:[i,g&&(0,cS.jsx)("div",{className:kx("loadingOverlay"),children:(0,cS.jsx)(cP.Loader,{})}),(0,cS.jsx)("div",{className:kx("actionsOverlay"),style:{top:52/o},children:(0,cS.jsx)("div",{className:kx("actions"),style:{transform:`scale(${1/o}`,top:-44/o,right:0,paddingLeft:8,paddingRight:8},ref:au,children:(0,cS.jsxs)(ab,{parentAction:ay,label:j,children:[aA&&(0,cS.jsxs)(cS.Fragment,{children:[(0,cS.jsx)(cx.LoadedRichTextMenu,{editor:aA.editor,field:aA.field,inline:!0,readOnly:!1}),aB&&(0,cS.jsx)(cP.ActionBar.Separator,{})]}),C.duplicate&&(0,cS.jsx)(cP.ActionBar.Action,{onClick:af,label:aw,children:(0,cS.jsx)(cP.Copy,{className:kx("actionsAction")})}),C.delete&&(0,cS.jsx)(cP.ActionBar.Action,{onClick:ag,label:ax,children:(0,cS.jsx)(cP.Trash,{className:kx("actionsAction")})})]})})}),(0,cS.jsx)("div",{className:kx("overlayWrapper"),children:(0,cS.jsx)(ac,{componentId:d,componentType:c,hover:ah,isSelected:h,children:(0,cS.jsx)("div",{className:kx("overlay")})})})]}),P||document.body),a(O)]})};(0,cR.init_react_import)();var kB={DropZone:"_DropZone_wc2ks_1","DropZone--hasChildren":"_DropZone--hasChildren_wc2ks_11","DropZone--isAreaSelected":"_DropZone--isAreaSelected_wc2ks_24","DropZone--hoveringOverArea":"_DropZone--hoveringOverArea_wc2ks_25","DropZone--isRootZone":"_DropZone--isRootZone_wc2ks_25","DropZone-item":"_DropZone-item_wc2ks_39","DropZone-linePlaceholder":"_DropZone-linePlaceholder_wc2ks_43","DropZone-hitbox":"_DropZone-hitbox_wc2ks_55","DropZone--isEnabled":"_DropZone--isEnabled_wc2ks_63","DropZone--isAnimating":"_DropZone--isAnimating_wc2ks_74"};(0,cR.init_react_import)();var kC=(a,{allow:b,disallow:c})=>{if(!a)return!0;let d=new Set(b),e=new Set(c);return c?(e.has(a)&&d.has(a)&&e.delete(a),!e.has(a)):!b||d.has(a)};(0,cR.init_react_import)(),(0,cR.init_react_import)();var kD={Drawer:"_Drawer_1n90m_1","Drawer-draggable":"_Drawer-draggable_1n90m_8","Drawer-draggableBg":"_Drawer-draggableBg_1n90m_12","DrawerItem-draggable":"_DrawerItem-draggable_1n90m_22","DrawerItem--disabled":"_DrawerItem--disabled_1n90m_38",DrawerItem:"_DrawerItem_1n90m_22","Drawer--isDraggingFrom":"_Drawer--isDraggingFrom_1n90m_48","DrawerItem-name":"_DrawerItem-name_1n90m_72"};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var kE="u">typeof PointerEvent?PointerEvent:Event,kF=class extends kE{constructor(a,b){super(a,b),this._originalTarget=null,this.originalTarget=b.originalTarget}set originalTarget(a){this._originalTarget=a}get originalTarget(){return this._originalTarget}};(0,cR.init_react_import)(),(0,cR.init_react_import)();var kG=(a,{isDraggingBetweenSlots:b=!1,isNewComponent:c=!1}={})=>"auto"===a?b||c?"static":"fluid":a;(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var kH=(a,b)=>{let c=a.indexes.nodes[b];if(!c)return;let d=`${c.parentId}:${c.zone}`,e=a.indexes.zones[d].contentIds.indexOf(b);return{zone:d,index:e}};function kI(a,b,c="force",d=!1,e){return(0,cR.__async)(this,null,function*(){let f=yield b().resolveComponentData(a,c);if(!f.didChange&&!d)return;let g=kH(b().state,f.node.props.id);g?b().dispatch({type:"replace",data:(0,cB.toComponent)(f.node),destinationIndex:g.index,destinationZone:g.zone,ui:e}):console.warn(`Warning: Could not find component with id "${a.props.id}" to resolve its data. Component may have been removed or the id is invalid.`)})}(0,cR.init_react_import)();var kJ=(a,b,c,d)=>(0,cR.__async)(null,null,function*(){var e,f,g;(0,d.getState().dispatch)({type:"move",sourceIndex:b.index,sourceZone:null!=(e=b.zone)?e:cB.rootDroppableId,destinationIndex:c.index,destinationZone:null!=(f=c.zone)?f:cB.rootDroppableId,recordHistory:!1});let h=null==(g=d.getState().state.indexes.nodes[a])?void 0:g.data;h&&(yield kI(h,d.getState,"move"))});function kK(a){return a?function a(b){return b?b.getAttribute("dir")||a(b.parentElement):"ltr"}(a):"ltr"}(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var kL=(a,b,c)=>Math.max(b,Math.min(c,a)),kM=(a,b)=>{let c=kL(a.x,Math.min(b.x1,b.x2),Math.max(b.x1,b.x2)),d=kL(a.y,Math.min(b.y1,b.y2),Math.max(b.y1,b.y2));return Math.hypot(a.x-c,a.y-d)};(0,cR.init_react_import)();var kN=(a,b,c=b.getComputedStyle(a))=>{let d=c.display,e="rtl"===kK(a);if("flex"===d||"inline-flex"===d){let a=c.flexDirection;if(a.startsWith("row")){let b="row-reverse"===a;return{axis:"x",reversed:e?!b:b}}return{axis:"y",reversed:"column-reverse"===a}}if("grid"===d||"inline-grid"===d){let a;return c.gridAutoFlow.startsWith("column")||((a=c.gridTemplateColumns.replace(/\[[^\]]*\]/g," ").trim())&&"none"!==a?a.split(/\s+/).length:0)>1?{axis:"x",reversed:e}:{axis:"y",reversed:!1}}return{axis:"y",reversed:!1}},kO=({axis:a,reversed:b})=>{let c="x"===a,d=b?-1:1;return{horizontal:c,reversed:b,forward:d,start:a=>c?b?a.right:a.left:b?a.bottom:a.top,end:a=>c?b?a.left:a.right:b?a.top:a.bottom,isBefore:(a,b)=>d>0?a<=b:a>=b}},kP=(a,b,c)=>{var d,e;let f=a.ownerDocument.defaultView;if(!f)return null;let g=new Map(c.map((a,b)=>[a,b])),h=Array.from(a.querySelectorAll(":scope > [data-puck-component]:not([data-dnd-dragging]):not([data-dnd-placeholder])")).map(a=>{var b,c;return{index:null!=(c=g.get(null!=(b=a.getAttribute("data-puck-component"))?b:""))?c:-1,el:a}}).filter(a=>-1!==a.index).sort((a,b)=>a.index-b.index).map(({index:a,el:b})=>({index:a,rect:b.getBoundingClientRect()}));if(0===h.length)return 0;let{horizontal:i,reversed:j,start:k,end:l}=kO(kN(a,f)),m=(a,b,c,d=[c])=>{let e=1/0,f=-1/0;for(let a of d)e=Math.min(e,i?a.top:a.left),f=Math.max(f,i?a.bottom:a.right);return i?{index:a,x1:b,x2:b,y1:c.top,y2:c.bottom,laneStart:e,laneEnd:f}:{index:a,x1:c.left,x2:c.right,y1:b,y2:b,laneStart:e,laneEnd:f}},n=[],o=(a,b,c)=>m(a,"before"===c?k(b):l(b),b);for(let a=0;a<=h.length;a++){let b=h[a-1],c=h[a];if(c)if(b)if(c.index-b.index>1)n.push(o(b.index+1,b.rect,"after")),n.push(o(c.index,c.rect,"before"));else if(j?l(b.rect)<k(c.rect):l(b.rect)>k(c.rect))n.push(o(c.index,c.rect,"before")),n.push(o(c.index,b.rect,"after"));else{let a=(l(b.rect)+k(c.rect))/2;n.push(m(c.index,a,c.rect,[b.rect,c.rect]))}else n.push(o(c.index,c.rect,"before"));else n.push(o(b.index+1,b.rect,"after"))}let p=i?b.y:b.x,q=null,r=1/0,s=null,t=1/0;for(let a of n){let c=kM(b,a);c<r&&(r=c,q=a),p>=a.laneStart&&p<=a.laneEnd&&c<t&&(t=c,s=a)}return null!=(e=null==(d=null!=s?s:q)?void 0:d.index)?e:null};(0,cR.init_react_import)();var kQ=(a,b)=>{var c;let d=document.querySelector("iframe#preview-frame");if(!d||a.ownerDocument!==d.contentDocument)return b;let e=d.getBoundingClientRect(),f=e.width/((null==(c=d.contentWindow)?void 0:c.innerWidth)||1);return f>0?{x:(b.x-e.left)/f,y:(b.y-e.top)/f}:b},kR=(0,cv.createContext)({dragListeners:{}}),kS=({children:a,disableAutoScroll:b,behavior:c="auto"})=>{let d,e,f,g,h,i,j,k,l=(0,cP.useAppStore)(a=>a.dispatch),m=((0,cP.useAppStore)(a=>a.instanceId),(0,cP.useAppStoreApi)()),n=(0,cv.useRef)(null),o=(d=(0,cv.useRef)(null),(0,cv.useCallback)(a=>{jB.setState({fallbackEnabled:!1});let b=(0,cQ.generateId)();d.current=b,setTimeout(()=>{d.current===b&&(jB.setState({fallbackEnabled:!0}),a.collisionObserver.forceUpdate(!0))},100)},[])),[p]=(0,cv.useState)(()=>{let a=new Map;return(0,cV.createStore)(()=>({zoneDepthIndex:{},nextZoneDepthIndex:{},areaDepthIndex:{},nextAreaDepthIndex:{},draggedItem:null,previewIndex:{},enabledIndex:{},hoveringComponent:null,registerRootVirtualizer:(b,c)=>{a.set(b,c)},unregisterRootVirtualizer:b=>{a.delete(b)},scrollToComponent:b=>{let c=Array.from(a.values());if(c.length>0)for(let a of c){let c=a.resolveIndex(b);c<0||a.virtualizer.scrollToIndex(c,{behavior:"auto",align:"auto"})}else{let a=kn(),c=null==a?void 0:a.querySelector(kp(b));null==c||c.scrollIntoView({behavior:"smooth"})}}}))}),q=(0,cv.useCallback)(a=>{let{zoneDepthIndex:b={},areaDepthIndex:c={}}=p.getState()||{},d=Object.keys(b).length>0,e=Object.keys(c).length>0,f=!1,g=!1;return a.zone&&!b[a.zone]?f=!0:!a.zone&&d&&(f=!0),a.area&&!c[a.area]?g=!0:!a.area&&e&&(g=!0),{zoneChanged:f,areaChanged:g}},[p]),r=(0,cv.useCallback)((a,b)=>{let{zoneChanged:c,areaChanged:d}=q(a);(c||d)&&(p.setState({zoneDepthIndex:a.zone?{[a.zone]:!0}:{},areaDepthIndex:a.area?{[a.area]:!0}:{}}),o(b),setTimeout(()=>{b.collisionObserver.forceUpdate(!0)},50),n.current=null)},[p]),s=(0,iU.useDebouncedCallback)(r,100),t=()=>{s.cancel(),n.current=null};(0,cv.useEffect)(()=>{},[]);let[u]=(0,cv.useState)(()=>[...b?hm.filter(a=>a!==g5):hm,(({onChange:a})=>class extends eJ{constructor(a,b){super(a);return}})({onChange:(a,b)=>{let c=p.getState(),{zoneChanged:d,areaChanged:e}=q(a),f=b.dragOperation.status.dragging;if(e||d){let b={},c={};a.zone&&(b={[a.zone]:!0}),a.area&&(c={[a.area]:!0}),p.setState({nextZoneDepthIndex:b,nextAreaDepthIndex:c})}if("void"!==a.zone&&(null==c?void 0:c.zoneDepthIndex.void))return void r(a,b);if(e){if(f){let c=n.current;c&&c.area===a.area&&c.zone===a.zone||(t(),s(a,b),n.current=a)}else t(),r(a,b);return}d&&r(a,b),t()}})]),v=jv(),[w,y]=(0,cv.useState)({}),z=(0,cv.useRef)(null),A=(0,cv.useRef)(void 0),{getTargetIndex:B,setActive:C,startScrollTracking:D,stopScrollTracking:E,update:F}=(e=(0,cP.useAppStoreApi)(),f=(0,cv.useRef)(null),g=(0,cv.useCallback)(a=>{var b;let c=null==(b=kn())?void 0:b.querySelector("[data-puck-entry]");a?null==c||c.setAttribute("data-puck-line-drag","true"):null==c||c.removeAttribute("data-puck-line-drag")},[]),h=(0,cv.useCallback)((a,b)=>{var c;let d=null==(c=kn())?void 0:c.querySelector(kq(a));if(!d)return null;let f=kQ(d,b.dragOperation.position.current);return kP(d,f,ku(e.getState().state,a))},[e]),i=(0,cv.useCallback)(a=>{var b;let{previewIndex:c={}}=p.getState(),d=Object.values(c).find(a=>null==a?void 0:a.linePlaceholder);if(!d)return;let f=null==(b=kn())?void 0:b.querySelector(kq(d.zone));if(!f)return;let g=kQ(f,a.dragOperation.position.current),h=f.getBoundingClientRect();if(!(g.x>=h.left&&g.x<=h.right&&g.y>=h.top&&g.y<=h.bottom))return;let i=kP(f,g,ku(e.getState().state,d.zone));null!==i&&i!==d.index&&p.setState({previewIndex:(0,cR.__spreadProps)((0,cR.__spreadValues)({},c),{[d.zone]:(0,cR.__spreadProps)((0,cR.__spreadValues)({},d),{index:i})})})},[e,p]),j=(0,cv.useCallback)(()=>{var a;null==(a=f.current)||a.call(f),f.current=null},[]),k=(0,cv.useCallback)(a=>{j();let b=kn();if(!b)return;let c=null,d=()=>{null===c&&(c=requestAnimationFrame(()=>{c=null,i(a)}))};b.addEventListener("scroll",d,{capture:!0,passive:!0}),f.current=()=>{null!==c&&cancelAnimationFrame(c),b.removeEventListener("scroll",d,{capture:!0})}},[j,i]),(0,cv.useEffect)(()=>j,[j]),{getTargetIndex:h,setActive:g,startScrollTracking:k,stopScrollTracking:j,update:i}),G=(0,cv.useMemo)(()=>({mode:"edit",areaId:"root",depth:0}),[]);return(0,cS.jsx)(kR.Provider,{value:{dragListeners:w,setDragListeners:y},children:(0,cS.jsx)(hL,{plugins:u,sensors:v,onDragEnd:(a,b)=>{var c,d;let e;E();let f=null==(c=kn())?void 0:c.querySelector("[data-puck-entry]");null==f||f.removeAttribute("data-puck-dragging");let{source:g,target:h}=a.operation;if(!g){C(!1),p.setState({draggedItem:null});return}let{zone:i,index:j}=g.data,{previewIndex:k={}}=p.getState()||{},n=null!=(d=Object.values(k).find(a=>(null==a?void 0:a.props.id)===g.id&&!a.ghost))?d:null,o=!a.canceled&&(null==h?void 0:h.type)!=="void"&&(null==n?void 0:n.linePlaceholder)?(({zones:a,itemId:b,targetZone:c,getExpectedOrder:d})=>{let e=kn();if(!e||ks(e))return()=>{};let f=Array.from(new Set(a)).map(a=>`${kq(a)} > [data-puck-component]:not([data-dnd-dragging]):not([data-dnd-placeholder])`).join(", "),g=()=>{let a=new Map;return e.querySelectorAll(f).forEach(c=>{let d=c.getAttribute("data-puck-component");d&&d!==b&&a.set(d,{el:c,rect:c.getBoundingClientRect()})}),a},h=g(),i=d();return()=>{kt(e,{zones:a,itemId:b,targetZone:c,getExpectedOrder:d,initialExpectedOrder:i},()=>{g().forEach(({el:a,rect:b},c)=>{var d;let e=null==(d=h.get(c))?void 0:d.rect;if(!e)return;let f=e.x-b.x,g=e.y-b.y;1>Math.abs(f)&&1>Math.abs(g)||a.animate({translate:[`${f}px ${g}px 0`,"0px 0px 0"]},kr)})})}})({zones:A.current?[A.current.zone,n.zone]:[n.zone],itemId:"move"===n.type?n.props.id:void 0,targetZone:n.zone,getExpectedOrder:()=>ku(m.getState().state,n.zone)}):null;e=dh(()=>{"idle"===g.status&&((()=>{var c,d,e,f,g;if(C(!1),p.setState({draggedItem:null}),a.canceled||(null==h?void 0:h.type)==="void"){p.setState({previewIndex:{}}),null==(c=w.dragend)||c.forEach(c=>{c(a,b)}),l({type:"setUi",ui:{itemSelector:null,isDragging:!1}});return}let k=n&&n.linePlaceholder&&A.current&&n.zone===A.current.zone&&n.index>A.current.index?n.index-1:null!=(d=null==n?void 0:n.index)?d:j;if(n){if(p.setState({previewIndex:{}}),"insert"===n.type){let a,b,c;a=n.componentType,b=n.zone,c=n.index,(0,cR.__async)(null,null,function*(){let{getState:d}=m,e=(0,cQ.generateId)(a),f={type:"insert",componentType:a,destinationIndex:c,destinationZone:b,id:e},g=d().state,h=(0,cQ.insertAction)(g,f,d()),i=d().dispatch;i((0,cR.__spreadProps)((0,cR.__spreadValues)({},f),{recordHistory:!0}));let j={index:c,zone:b};i({type:"setUi",ui:{itemSelector:j}});let k=(0,cQ.getItem)(j,h);k&&(yield kI(k,d,"insert"))})}else A.current&&kJ(n.props.id,A.current,(0,cR.__spreadProps)((0,cR.__spreadValues)({},n),{index:k}),m);null==o||o()}let q=(null==(e=A.current)?void 0:e.zone)!==(null==n?void 0:n.zone)||(null==(f=A.current)?void 0:f.index)!==k;l({type:"setUi",ui:{itemSelector:n?{index:k,zone:n.zone}:{index:j,zone:i},isDragging:!1},recordHistory:q}),null==(g=w.dragend)||g.forEach(c=>{c(a,b)})})(),null==e||e())})},onDragMove:(a,b)=>{var c;F(b),null==(c=w.dragmove)||c.forEach(c=>{c(a,b)})},onDragOver:(a,b)=>{var d,e,f,g,h,i;if(a.preventDefault(),!(null==(d=p.getState())?void 0:d.draggedItem))return;t();let{source:j,target:k}=a.operation;if(!k||!j||"void"===k.type)return;let[l]=j.id.split(":"),[n]=k.id.split(":"),o=j.data,q=o.zone,r=o.index,s="",u=0;if("component"===k.type){let a=k.data;s=a.zone;let c=null==(e=b.collisionObserver.collisions[0])?void 0:e.data;u=jF({position:jE(null==c?void 0:c.direction,kK(k.element)),sourceIndex:r,targetIndex:a.index,isSameZone:q===s})}else s=k.id.toString(),u=0;let v=(null==(f=m.getState().state.indexes.nodes[k.id])?void 0:f.path)||[];if(!(n===l||v.find(a=>{let[b]=a.split(":");return b===l}))){if("new"===z.current){let a="static"===kG(c,{isNewComponent:!0});a&&(u=null!=(g=B(s,b))?g:u),C(a),p.setState({previewIndex:{[s]:{componentType:o.componentType,type:"insert",index:u,zone:s,element:j.element,props:{id:j.id.toString()},linePlaceholder:a}}})}else{A.current||(A.current={zone:o.zone,index:o.index});let a=(0,cQ.getItem)(A.current,m.getState().state);if(a){let d=A.current.zone,e=d!==s,f="static"===kG(c,{isDraggingBetweenSlots:e});f&&(u=null!=(h=B(s,b))?h:u),C(f);let g={[s]:{componentType:o.componentType,type:"move",index:u,zone:s,props:a.props,element:j.element,linePlaceholder:f}};if(f&&e){let b=p.getState().previewIndex[d],c=A.current.index;b&&!b.linePlaceholder&&(c=b.index),g[d]={componentType:o.componentType,type:"move",index:c,zone:d,props:a.props,element:j.element,ghost:!0}}p.setState({previewIndex:g})}}null==(i=w.dragover)||i.forEach(c=>{c(a,b)})}},onDragStart:(a,b)=>{var d;"fluid"!==c&&D(b);let{source:e}=a.operation;if((null==e?void 0:e.type)==="component"){let a=e.data,b={zone:a.zone,index:a.index};A.current=b;let d=(0,cQ.getItem)(b,m.getState().state);if(d){let b="static"===kG(c);C(b),p.setState({previewIndex:{[a.zone]:{componentType:a.componentType,type:"move",index:a.index,zone:a.zone,props:d.props,element:e.element,linePlaceholder:b}}})}}null==(d=w.dragstart)||d.forEach(c=>{c(a,b)})},onBeforeDragStart:a=>{var b,c,d,e;z.current=(null==(b=a.operation.source)?void 0:b.type)==="drawer"?"new":"existing",A.current=void 0,p.setState({draggedItem:a.operation.source}),(null==(c=m.getState().selectedItem)?void 0:c.props.id)!==(null==(d=a.operation.source)?void 0:d.id)?l({type:"setUi",ui:{itemSelector:null,isDragging:!0},recordHistory:!1}):l({type:"setUi",ui:{isDragging:!0},recordHistory:!1});let f=null==(e=kn())?void 0:e.querySelector("[data-puck-entry]");null==f||f.setAttribute("data-puck-dragging","true"),C(!1)},children:(0,cS.jsx)(kk,{store:p,children:(0,cS.jsx)(kl,{value:G,children:a})})})})},kT=({children:a,disableAutoScroll:b,behavior:c})=>"LOADING"===(0,cP.useAppStore)(a=>a.status)?a:(0,cS.jsx)(kS,{disableAutoScroll:b,behavior:c,children:a}),kU=(0,cA.get_class_name_factory_default)("Drawer",kD),kV=(0,cA.get_class_name_factory_default)("DrawerItem",kD),kW=({children:a,name:b,label:c,dragRef:d,isDragDisabled:e})=>{let f=(0,cv.useMemo)(()=>a||(({children:a})=>(0,cS.jsx)("div",{className:kV("default"),children:a})),[a]);return(0,cS.jsx)("div",{className:kV({disabled:e}),ref:d,onMouseDown:a=>a.preventDefault(),"data-testid":d?`drawer-item:${b}`:"","data-puck-drawer-item":!0,children:(0,cS.jsx)(f,{name:b,children:(0,cS.jsx)("div",{className:kV("draggableWrapper"),children:(0,cS.jsxs)("div",{className:kV("draggable"),children:[(0,cS.jsx)("div",{className:kV("name"),children:null!=c?c:b}),(0,cS.jsx)("div",{className:kV("icon"),children:(0,cS.jsx)(jq,{})})]})})})})},kX=({children:a,name:b,label:c,id:d,isDragDisabled:e})=>{let f=kv((0,cv.useContext)(kj)),{ref:g}=function(a){let{disabled:b,data:c,element:d,handle:e,id:f,modifiers:g,sensors:h,plugins:i}=a,j=hN(b=>new hp(hA(hG({},a),hB({register:!1,handle:hs(e),element:hs(d)})),b)),k=hu(j,hO);return hx(f,()=>j.id=f),hy(e,a=>j.handle=a),hy(d,a=>j.element=a),hx(c,()=>c&&(j.data=c)),hx(b,()=>j.disabled=!0===b),hx(h,()=>j.sensors=h),hx(g,()=>j.modifiers=g,void 0,dH),hx(i,()=>j.plugins=i,void 0,dH),hx(a.alignment,()=>j.alignment=a.alignment),{draggable:k,get isDragging(){return k.isDragging},get isDropping(){return k.isDropping},get isDragSource(){return k.isDragSource},handleRef:(0,cv.useCallback)(a=>{j.handle=null!=a?a:void 0},[j]),ref:(0,cv.useCallback)(a=>{var b,c;(a||null==(b=j.element)||!b.isConnected||(null==(c=j.manager)?void 0:c.dragOperation.status.idle))&&(j.element=null!=a?a:void 0)},[j])}}({id:d,data:{componentType:b},disabled:e,type:"drawer",plugins:[gY.configure({dropAnimation:f})]});return(0,cS.jsxs)("div",{className:kU("draggable"),children:[(0,cS.jsx)("div",{className:kU("draggableBg"),children:(0,cS.jsx)(kW,{name:b,label:c,children:a})}),(0,cS.jsx)("div",{className:kU("draggableFg"),children:(0,cS.jsx)(kW,{name:b,label:c,dragRef:g,isDragDisabled:e,children:a})})]})},kY=({children:a,droppableId:b,direction:c})=>{b&&console.error("Warning: The `droppableId` prop on Drawer is deprecated and no longer required."),c&&console.error("Warning: The `direction` prop on Drawer is deprecated and no longer required to achieve multi-directional dragging.");let d=j9(),{ref:e}=h1({id:d,type:"void",collisionPriority:0});return(0,cS.jsx)("div",{className:kU(),ref:e,"data-puck-dnd":d,"data-puck-drawer":!0,"data-puck-dnd-void":!0,children:a})};kY.Item=({name:a,children:b,id:c,label:d,index:e,isDragDisabled:f})=>{let g=c||a,[h,i]=(0,cv.useState)((0,cQ.generateId)(g));return void 0!==e&&console.error("Warning: The `index` prop on Drawer.Item is deprecated and no longer required."),!function(a,b,c=[]){let{setDragListeners:d}=(0,cv.useContext)(kR);(0,cv.useEffect)(()=>{d&&d(c=>(0,cR.__spreadProps)((0,cR.__spreadValues)({},c),{[a]:[...c[a]||[],b]}))},c)}("dragend",()=>{i((0,cQ.generateId)(g))},[g]),(0,cS.jsx)("div",{children:(0,cS.jsx)(kX,{name:a,label:d,id:h,isDragDisabled:f,children:b})},h)},(0,cR.init_react_import)();var kZ=(a,b)=>a.getState().state.indexes.zones[b].contentIds.length;(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var k$=({componentId:a,zone:b})=>{let c=(0,cP.useAppStore)(a=>a.config),d=(0,cP.useAppStore)(a=>a.metadata),e=(0,cP.useAppStore)(cU(c=>{var d,e;let f=c.state.indexes;return(null!=(e=null==(d=f.zones[`${a}:${b}`])?void 0:d.contentIds)?e:[]).map(a=>f.nodes[a].flatData)}));return(0,cS.jsx)(cL,{content:e,zone:b,config:c,metadata:d})};function k_(a,b,c,d,e){let f=(0,cv.useRef)(null),g=(0,cv.useRef)(null),h=(0,cv.useRef)(b.props),i=(0,cv.useMemo)(()=>cE(c,d,e),[c,d,e]),j=(0,cv.useMemo)(()=>{var c,d,e,j;let k,l="root"===b.type?a.root:null==(c=a.components)?void 0:c[b.type],m=null!=(d=null==l?void 0:l.fields)?d:{},n=f.current!==i,o=!1;if(!g.current||n)for(let a in b.props)(null==(e=m[a])?void 0:e.type)==="slot"&&(o=!0);else for(let a of(k=["id"],new Set([...Object.keys(b.props),...Object.keys(g.current)])))b.props[a]!==g.current[a]&&(k.push(a),(null==(j=m[a])?void 0:j.type)==="slot"&&(o=!0));let p=(0,cB.mapFields)(b,i,a,!1,o,k).props;return g.current=b.props,f.current=i,h.current=k?(0,cR.__spreadValues)((0,cR.__spreadValues)({},h.current),p):p,h.current},[a,b,i]);return(0,cv.useMemo)(()=>(0,cR.__spreadValues)((0,cR.__spreadValues)({},b.props),j),[b.props,j])}(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var k0=(a,b={})=>{if(!a)return;let{disableDrag:c=!1,disableDragOnFocus:d=!0}=b,e=a=>{a.stopPropagation()};a.addEventListener("mouseover",e,{capture:!0});let f=()=>{setTimeout(()=>{a.addEventListener("pointerdown",e,{capture:!0})},200)},g=()=>{a.removeEventListener("pointerdown",e,{capture:!0})};return c?a.addEventListener("pointerdown",e,{capture:!0}):d&&(a.addEventListener("focus",f,{capture:!0}),a.addEventListener("blur",g,{capture:!0})),a.setAttribute("data-puck-overlay-portal","true"),()=>{a.removeEventListener("mouseover",e,{capture:!0}),c?a.removeEventListener("pointerdown",e,{capture:!0}):d&&(a.removeEventListener("focus",f,{capture:!0}),a.removeEventListener("blur",g,{capture:!0})),a.removeAttribute("data-puck-overlay-portal")}};(0,cR.init_react_import)();var k1=(0,cA.get_class_name_factory_default)("InlineTextField",{InlineTextField:"_InlineTextField_104qp_1"}),k2=(0,cv.memo)(({propPath:a,componentId:b,value:c,isReadOnly:d,opts:e={}})=>{var f;let g=(0,cv.useRef)(null),h=(0,cP.useAppStoreApi)(),i=null!=(f=e.disableLineBreaks)&&f;(0,cv.useEffect)(()=>{let d=h.getState(),e=d.state.indexes.nodes[b].data;if(!d.getComponentConfig(e.type))throw Error(`InlineTextField Error: No config defined for ${e.type}`);if(g.current){let d=null!=c?c:"";d!==g.current.innerText&&g.current.replaceChildren(d);let e=k0(g.current),f=c=>(0,cR.__async)(null,null,function*(){let d=h.getState().state.indexes.nodes[b],e=c.target.innerText;i&&(e=e.replaceAll(/\n/gm,""));let f=jc(d.data.props,a,e);yield kI((0,cR.__spreadProps)((0,cR.__spreadValues)({},d.data),{props:f}),h.getState,"replace",!0)});return g.current.addEventListener("input",f),()=>{var a;null==(a=g.current)||a.removeEventListener("input",f),null==e||e()}}},[h,g.current,c,i]);let[j,k]=(0,cv.useState)(!1),[l,m]=(0,cv.useState)(!1);return(0,cS.jsx)("span",{className:k1(),ref:g,contentEditable:j||l?"plaintext-only":"false",onClick:a=>{a.preventDefault(),a.stopPropagation()},onClickCapture:a=>{a.preventDefault(),a.stopPropagation();let c=kH(h.getState().state,b);h.getState().setUi({itemSelector:c})},onKeyDown:a=>{a.stopPropagation(),(i&&"Enter"===a.key||d)&&a.preventDefault()},onKeyUp:a=>{a.stopPropagation(),a.preventDefault()},onMouseOverCapture:()=>k(!0),onMouseOutCapture:()=>k(!1),onFocus:()=>m(!0),onBlur:()=>m(!1)})});(0,cR.init_react_import)();var k3=(0,cv.lazy)(()=>a.A(272383).then(a=>({default:a.Editor}))),k4=(0,cv.lazy)(()=>a.A(627201).then(a=>({default:a.RichTextRender}))),k5=(0,cv.memo)(({value:a,componentId:b,propPath:c,field:d,id:e})=>{let f=(0,cv.useRef)(null),g=(0,cP.useAppStoreApi)();(0,cv.useEffect)(()=>{if(!f.current)return;let a=k0(f.current,{disableDragOnFocus:!0});return()=>null==a?void 0:a()},[f.current]);let h=(0,cv.useCallback)((a,d)=>(0,cR.__async)(null,null,function*(){let e=g.getState().state.indexes.nodes[b],f=jc(e.data.props,c,a);yield kI((0,cR.__spreadProps)((0,cR.__spreadValues)({},e.data),{props:f}),g.getState,"replace",!0,d)}),[g,b,c]),i=(0,cv.useCallback)(a=>{g.setState({currentRichText:{inlineComponentId:b,inline:!0,field:d,editor:a,id:e}})},[d,b]);if(!d.contentEditable)return(0,cS.jsx)(cv.Suspense,{fallback:(0,cS.jsx)(cH,{content:a}),children:(0,cS.jsx)(k4,{content:a,field:d})});let j={content:a,onChange:h,field:d,inline:!0,onFocus:i,id:e,name:c};return(0,cS.jsx)("div",{ref:f,onClick:a=>{a.preventDefault(),a.stopPropagation()},onClickCapture:a=>{a.preventDefault(),a.stopPropagation();let c=kH(g.getState().state,b);g.getState().setUi({itemSelector:c})},children:(0,cS.jsx)(cv.Suspense,{fallback:(0,cS.jsx)(j6,(0,cR.__spreadValues)({},j)),children:(0,cS.jsx)(k3,(0,cR.__spreadValues)({},j))})})});k5.displayName="InlineEditorWrapper",(0,cR.init_react_import)(),(0,cR.init_react_import)();var k6=(0,cv.memo)(({Component:a,componentProps:b})=>(0,cS.jsx)(a,(0,cR.__spreadValues)({},b)),(a,b)=>{let c=!0;return"puck"in a.componentProps&&"puck"in b.componentProps&&(c=(0,iV.deepEqual)(a.componentProps.puck,b.componentProps.puck)),a.Component===b.Component&&function(a,b,c=[]){if(Object.is(a,b))return!0;if("object"!=typeof a||null===a||"object"!=typeof b||null===b||Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return!1;let d=new Set(c),e=Object.keys(a).filter(a=>!d.has(a)),f=Object.keys(b).filter(a=>!d.has(a));if(e.length!==f.length)return!1;for(let c=0;c<e.length;c++){let d=e[c];if(!Object.prototype.hasOwnProperty.call(b,d)||!Object.is(a[d],b[d]))return!1}return!0}(a.componentProps,b.componentProps,["puck"])&&c});(0,cR.init_react_import)();var k7=new Map,k8=({contentIds:a,zoneCompound:b,renderItem:c})=>{let d=(0,cP.useAppStore)(a=>{var b,c;return null!=(c=null==(b=a.selectedItem)?void 0:b.props.id)?c:null}),e=kn(),f=(0,cv.useContext)(kj),g=jl(kj,a=>{var b;let c=null==(b=a.draggedItem)?void 0:b.id;return c?String(c):null}),h=jl(kj,a=>{var b,c,d;if(null==(b=a.draggedItem)?void 0:b.id){let[b]=null!=(d=Object.entries(null!=(c=a.previewIndex)?c:{}).find(([,a])=>!(null==a?void 0:a.ghost)))?d:[];return null==b?void 0:b.split(":")[0]}return null}),i=null==e?void 0:e.defaultView,j=(0,cv.useRef)(new Map),k=(0,cP.useAppStoreApi)(),l=(0,cv.useCallback)(b=>{var c,d,e,f;if(!b||"root"===b)return -1;let g=a.indexOf(b);if(g>-1)return g;let h=null!=(e=null==(d=null==(c=k.getState().state.indexes.nodes)?void 0:c[b])?void 0:d.path)?e:[];for(let b=h.length-1;b>=0;b-=1){let c=null==(f=h[b])?void 0:f.split(":")[0];if(!c||"root"===c)continue;let d=a.indexOf(c);if(d>-1)return d}return -1},[k,a]),m=(0,cv.useMemo)(()=>{let a=new Set;return[d,g,h].forEach(b=>{let c=l(b);c>-1&&a.add(c)}),Array.from(a).sort((a,b)=>a-b)},[h,g,l,d]),n=(0,cv.useCallback)(a=>{let b=i_(a);return m.forEach(a=>{b.includes(a)||b.push(a)}),b.sort((a,b)=>a-b),b},[m]),o=i9({count:a.length,getItemKey:b=>a[b],estimateSize:b=>{var c,d;return c=a[b],null!=(d=k7.get(c))?d:320},getScrollElement:()=>null!=i?i:null,overscan:5,observeElementRect:(a,b)=>i?((a,b)=>{let c=a.scrollElement;if(!c)return;let d=()=>{b({width:c.innerWidth,height:c.innerHeight})};return d(),c.addEventListener("resize",d,i1),()=>{c.removeEventListener("resize",d)}})(a,b):i0(a,b),observeElementOffset:(a,b)=>i?i2(a,b,b=>a.options.horizontal?b.scrollX:b.scrollY):i3(a,b),scrollToFn:(a,b,c)=>i5(a,b,c),rangeExtractor:n,initialOffset:()=>i?i.scrollY:0});(0,cv.useEffect)(()=>(f.getState().registerRootVirtualizer(b,{resolveIndex:a=>l(a),virtualizer:o}),()=>{f.getState().unregisterRootVirtualizer(b)}),[l,o,b,f]);let p=(0,cv.useCallback)(a=>{let b=j.current.get(a);if(b)return b;let c=b=>{if(!b)return;let c=Math.ceil(b.getBoundingClientRect().height)||320;"number"==typeof c&&c>0&&(c<=0||k7.set(a,c))};return j.current.set(a,c),c},[]);(0,cv.useEffect)(()=>{let b=new Set(a);Array.from(j.current.keys()).forEach(a=>{b.has(a)||j.current.delete(a)})},[a]);let q=o.getVirtualItems(),r=o.getTotalSize(),s=(0,cv.useMemo)(()=>{let b=[],d=0,e=-1;q.forEach(f=>{if(!f)return;let g=a[f.index],h=Math.max(f.start-d,0);h>0&&b.push((0,cS.jsx)("div",{style:{height:`${h}px`}},`gap:${e}:${f.index}`)),b.push(c({componentId:g,index:f.index,measureRef:p(g)})),d=f.end,e=f.index});let f=Math.max(r-d,0);return f>0&&b.push((0,cS.jsx)("div",{style:{height:`${f}px`}},`gap:${e}:end`)),b},[r,q,p]);return(0,cS.jsx)(cS.Fragment,{children:s})};(0,cR.init_react_import)();var k9=(0,cA.get_class_name_factory_default)("DropZone",kB),la="var(--puck-line-placeholder-width, 2px)",lb=({zoneRef:a,contentIds:b,index:c})=>{let[d,e]=(0,cv.useState)();return((0,cv.useLayoutEffect)(()=>{var d,f,g,h;let i,j=a.current,k=null==j?void 0:j.ownerDocument.defaultView;if(!j||!k)return;let l=a=>parseFloat(null!=a?a:"")||0,m=a=>{let c=b[a];if(void 0===c)return;let d=j.querySelector(`:scope > ${kp(c)}:not([data-dnd-dragging])`);if(d)return{el:d,rect:d.getBoundingClientRect()}},n=j.getBoundingClientRect(),o=k.getComputedStyle(j),p=m(c-1),q=m(c),r=null!=q?q:p,{horizontal:s,reversed:t,forward:u,start:v,end:w,isBefore:y}=kO(kN(j,k,o)),z=l(s?o.columnGap:o.rowGap),A=(a,b)=>{var c;return l(null==(c=a?k.getComputedStyle(a):void 0)?void 0:c["start"===b==!t?s?"marginLeft":"marginTop":s?"marginRight":"marginBottom"])},B=l(o.borderLeftWidth),C=l(o.borderTopWidth),D=l(o.borderRightWidth),E=l(o.borderBottomWidth);i=q?p&&y(w(p.rect),v(q.rect))?(w(p.rect)+v(q.rect))/2:v(q.rect)-u*(Math.max(A(q.el,"start"),z)/2):p?w(p.rect)+u*(Math.max(A(p.el,"end"),z)/2):s?t?n.right-D-l(o.paddingRight):n.left+B+l(o.paddingLeft):t?n.bottom-E-l(o.paddingBottom):n.top+C+l(o.paddingTop),s?e({top:(null!=(d=null==r?void 0:r.rect.top)?d:n.top+C+l(o.paddingTop))-n.top+j.scrollTop-C,height:null!=(f=null==r?void 0:r.rect.height)?f:n.height-C-E-l(o.paddingTop)-l(o.paddingBottom),left:kL(i-n.left+j.scrollLeft-B,0,j.scrollWidth),width:la,transform:"translateX(-50%)"}):e({left:(null!=(g=null==r?void 0:r.rect.left)?g:n.left+B+l(o.paddingLeft))-n.left+j.scrollLeft-B,width:null!=(h=null==r?void 0:r.rect.width)?h:n.width-B-D-l(o.paddingLeft)-l(o.paddingRight),top:kL(i-n.top+j.scrollTop-C,0,j.scrollHeight),height:la,transform:"translateY(-50%)"})},[a,b,c]),d)?(0,cS.jsx)("div",{className:k9("linePlaceholder"),style:d,"data-puck-line-placeholder":!0}):null},lc=(0,cA.get_class_name_factory_default)("DropZone",kB),ld=({element:a,label:b,override:c})=>a?(0,cS.jsx)("div",{dangerouslySetInnerHTML:{__html:a.outerHTML}}):(0,cS.jsx)(kW,{name:b,children:c}),le=a=>(0,cS.jsx)(lg,(0,cR.__spreadValues)({},a)),lf=(0,cv.memo)(({zoneCompound:a,componentId:b,index:c,dragAxis:d,collisionAxis:e,inDroppableZone:f,itemRef:g})=>{var h,i,j,k;let l=(0,cP.useAppStore)(a=>a.metadata),m=(0,cv.useContext)(ki),{depth:n=1}=null!=m?m:{},o=(0,cv.useContext)(kj),p=(0,cP.useAppStore)(cU(a=>{var c;return null==(c=a.state.indexes.nodes[b])?void 0:c.flatData.props})),q=(0,cP.useAppStore)(a=>{var c;return null==(c=a.state.indexes.nodes[b])?void 0:c.data.type}),r=(0,cP.useAppStore)(cU(a=>{var c;return null==(c=a.state.indexes.nodes[b])?void 0:c.data.readOnly})),s=(0,cP.useAppStoreApi)(),t=(0,cv.useMemo)(()=>{if(p)return(0,cB.expandNode)({type:q,props:p});let c=o.getState().previewIndex[a];return b===(null==c?void 0:c.props.id)?{type:c.componentType,props:c.props,previewType:c.type,element:c.element}:null},[s,b,a,q,p]),u=(0,cP.useAppStore)(a=>(null==t?void 0:t.type)?a.config.components[t.type]:null),v=(0,cv.useMemo)(()=>({renderDropZone:le,isEditing:!0,dragRef:null,metadata:(0,cR.__spreadValues)((0,cR.__spreadValues)({},l),null==u?void 0:u.metadata)}),[l,null==u?void 0:u.metadata]),w=(0,cP.useAppStore)(a=>a.overrides),y=(0,cP.useAppStore)(a=>{var c;return(null==(c=a.componentState[b])?void 0:c.loadingCount)>0}),z=(0,cP.useAppStore)(a=>{var c;return(null==(c=a.selectedItem)?void 0:c.props.id)===b}),A=(0,cP.useMessage)("label-component"),B=(0,cP.useMessage)("canvas-noconfig",{type:null!=(i=null==(h=null==t?void 0:t.type)?void 0:h.toString())?i:""}),C=null!=(k=null!=(j=null==u?void 0:u.label)?j:null==t?void 0:t.type.toString())?k:A,D=(0,cv.useMemo)(()=>(0,cR.__spreadProps)((0,cR.__spreadValues)((0,cR.__spreadValues)({},null==u?void 0:u.defaultProps),null==t?void 0:t.props),{puck:v,editMode:!0}),[null==u?void 0:u.defaultProps,null==t?void 0:t.props,v]),E=(0,cv.useMemo)(()=>{var a;return{type:null!=(a=null==t?void 0:t.type)?a:q,props:D}},[null==t?void 0:t.type,q,D]),F=(0,cP.useAppStore)(a=>a.config),G=(0,cP.useAppStore)(a=>a.plugins),H=(0,cP.useAppStore)(a=>a.fieldTransforms),I=k_(F,E,(0,cv.useMemo)(()=>(0,cR.__spreadValues)((0,cR.__spreadValues)((0,cR.__spreadValues)((0,cR.__spreadValues)((0,cR.__spreadValues)({},cD(le,a=>(0,cS.jsx)(k$,{componentId:b,zone:a.zone}))),{text:({value:a,componentId:b,field:c,propPath:d,isReadOnly:e})=>c.contentEditable?(0,cS.jsx)(k2,{propPath:d,componentId:b,value:a,opts:{disableLineBreaks:!0},isReadOnly:e}):a,textarea:({value:a,componentId:b,field:c,propPath:d,isReadOnly:e})=>c.contentEditable?(0,cS.jsx)(k2,{propPath:d,componentId:b,value:a,isReadOnly:e}):a,custom:({value:a,componentId:b,field:c,propPath:d,isReadOnly:e})=>c.contentEditable&&"string"==typeof a?(0,cS.jsx)(k2,{propPath:d,componentId:b,value:a,isReadOnly:e}):a}),{richtext:({value:a,componentId:b,field:c,propPath:d,isReadOnly:e})=>{let{contentEditable:f=!0,tiptap:g}=c;if(!1===f||e)return(0,cS.jsx)(k4,{content:a,field:c});let h=`${b}_${c.type}_${d}`;return(0,cS.jsx)(k5,{value:a,componentId:b,propPath:d,field:c,id:h},h)}}),G.reduce((a,b)=>(0,cR.__spreadValues)((0,cR.__spreadValues)({},a),b.fieldTransforms),{})),H),[G,H]),r,y);if(!t)return;let J=u?u.render:()=>(0,cS.jsx)("div",{style:{padding:48,textAlign:"center"},children:B}),K=t.type,L="previewType"in t&&"insert"===t.previewType;return(0,cS.jsx)(kA,{id:b,componentType:K,zoneCompound:a,depth:n+1,index:c,isLoading:y,isSelected:z,label:C,autoDragAxis:d,userDragAxis:e,inDroppableZone:f,itemRef:g,children:a=>{var b;return(null==u?void 0:u.inline)&&!L?(0,cS.jsx)(k6,{Component:J,componentProps:(0,cR.__spreadProps)((0,cR.__spreadValues)({},I),{puck:(0,cR.__spreadProps)((0,cR.__spreadValues)({},I.puck),{dragRef:a})})}):(0,cS.jsx)("div",{ref:a,children:L?(0,cS.jsx)(ld,{label:C,override:null!=(b=w.componentItem)?b:w.drawerItem,element:"element"in t&&t.element?t.element:void 0}):(0,cS.jsx)(k6,{Component:J,componentProps:I})})}})}),lg=(0,cv.forwardRef)(function({zone:a,allow:b,disallow:c,style:d,className:e,minEmptyHeight:f="128px",collisionAxis:g,as:h},i){let j=(0,cv.useContext)(ki),k=(0,cP.useAppStoreApi)(),{areaId:l,depth:m=0,registerLocalZone:n,unregisterLocalZone:o}=null!=j?j:{},p=(0,cP.useAppStore)(cU(a=>{var b;return l?null==(b=a.state.indexes.nodes[l])?void 0:b.path:null})),q=cB.rootDroppableId;l&&a!==cB.rootDroppableId&&(q=`${l}:${a}`);let r=q===cB.rootDroppableId||a===cB.rootDroppableId||"root"===l,s=jl(kj,a=>a.nextAreaDepthIndex[l||""]),t=(0,cP.useAppStore)(cU(a=>{var b;return null==(b=a.state.indexes.zones[q])?void 0:b.contentIds})),u=(0,cP.useAppStore)(cU(a=>{var b;return null==(b=a.state.indexes.zones[q])?void 0:b.type}));(0,cv.useEffect)(()=>{(!u||"dropzone"===u)&&(null==j?void 0:j.registerZone)&&(null==j||j.registerZone(q))},[u,k]),(0,cv.useEffect)(()=>{"dropzone"===u&&q!==cB.rootDroppableId&&console.warn("DropZones have been deprecated in favor of slot fields and will be removed in a future version of Puck. Please see the migration guide: https://www.puckeditor.com/docs/guides/migrations/dropzones-to-slots")},[u]);let v=(0,cv.useMemo)(()=>t||[],[t]),w=(0,cv.useRef)(null),y=(0,cv.useCallback)(a=>kC(a,{allow:b,disallow:c}),[b,c]),z=jl(kj,a=>{var b;return y(null==(b=a.draggedItem)?void 0:b.data.componentType)}),A=s||r,B=jl(kj,a=>{var b;let c=!0;return(c=null!=(b=a.zoneDepthIndex[q])&&b)&&(c=z),c});(0,cv.useEffect)(()=>(n&&n(q,z||B),()=>{o&&o(q)}),[z,B,q]);let[C,D]=((a,b)=>{var c,d;let e,f=(0,cv.useContext)(kj),g=jl(kj,a=>a.previewIndex[b]),h=(0,cP.useAppStore)(a=>a.state.ui.isDragging),[i,j]=(0,cv.useState)(a),[k,l]=(0,cv.useState)(g),m=(c=(a,b,c,d,e,f)=>{(!c||e)&&(b&&!b.linePlaceholder?j((0,cQ.insert)(a.filter(a=>a!==b.props.id),b.index,b.props.id)):j(e&&!f?a.filter(a=>a!==d):a),l(b))},d=[],e=hM(),(0,cv.useCallback)((...a)=>(0,cR.__async)(null,null,function*(){return yield null==e?void 0:e.renderer.rendering,c(...a)}),[...d,e]));return(0,cv.useEffect)(()=>{var b;let c=f.getState(),d=null==(b=c.draggedItem)?void 0:b.id,e=Object.values(c.previewIndex||{});m(a,g,h,d,e.length>0,e.some(a=>null==a?void 0:a.linePlaceholder))},[a,g,h]),[i,k]})(v,q),E=D&&!D.linePlaceholder?1:0,F=C.length===E,G=B&&F,H=(0,cv.useContext)(kj);(0,cv.useEffect)(()=>{let{enabledIndex:a}=H.getState();H.setState({enabledIndex:(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{[q]:B})})},[B,H,q]);let{ref:I}=h1({id:q,collisionPriority:B?m:0,disabled:!G,collisionDetector:jA,type:"dropzone",data:{areaId:l,depth:m,isDroppableTarget:z,path:p||[]}}),J=(0,cP.useAppStore)(a=>(null==a?void 0:a.selectedItem)&&l===(null==a?void 0:a.selectedItem.props.id)),[K]=((a,b)=>{let c=(0,cP.useAppStore)(a=>a.status),[d,e]=(0,cv.useState)(b||"y"),f=(0,cv.useCallback)(()=>{if(a.current){let b=window.getComputedStyle(a.current);"grid"===b.display?e("dynamic"):"flex"===b.display&&"row"===b.flexDirection?e("x"):e("y")}},[a.current]);return(0,cv.useEffect)(()=>{let a=()=>{f()};return window.addEventListener("viewportchange",a),()=>{window.removeEventListener("viewportchange",a)}},[]),(0,cv.useEffect)(f,[c,b]),[d,f]})(w,g),[L,M]=(({zoneCompound:a,userMinEmptyHeight:b,ref:c})=>{let d=(0,cP.useAppStoreApi)(),[e,f]=(0,cv.useState)(0),[g,h]=(0,cv.useState)(!1),{draggedItem:i,isZone:j}=jl(kj,b=>{var c,d;return{draggedItem:(null==(c=b.draggedItem)?void 0:c.data.zone)===a?b.draggedItem:null,isZone:(null==(d=b.draggedItem)?void 0:d.data.zone)===a}}),k=(0,cv.useRef)(0),l=km(b=>{if(b){let b=kZ(d,a);if(f(0),b||0===k.current)return void h(!1);let c=d.getState().selectedItem,e=d.getState().state.indexes.zones,g=d.getState().nodes;g.setOverlayVisible(null==c?void 0:c.props.id,!1),setTimeout(()=>{var b;let d=(null==(b=e[a])?void 0:b.contentIds)||[];g.syncNodes(d),c&&setTimeout(()=>{g.syncNode(c.props.id),g.setOverlayVisible(c.props.id,!0)},200),h(!1)},100)}},[d,e,a]);(0,cv.useEffect)(()=>{if(i&&c.current&&j){let b=c.current.getBoundingClientRect();return k.current=kZ(d,a),f(b.height),h(!0),l()}},[c.current,i,l]);let m=isNaN(Number(b))?b:`${b}px`;return[e?`${e}px`:m,g]})({zoneCompound:q,userMinEmptyHeight:f,ref:w}),N=(0,cv.useCallback)(a=>{kw([w,I,i],a)},[I]),O=(0,cP.useAppStore)(a=>a._experimentalVirtualization),P=(null!=l?l:cB.rootAreaId)===cB.rootAreaId&&0===m;return(0,cS.jsxs)(null!=h?h:"div",{className:`${lc({isRootZone:r,hoveringOverArea:A,isEnabled:B,isAreaSelected:J,hasChildren:v.length>0,isAnimating:M})}${e?` ${e}`:""}`,ref:N,"data-testid":`dropzone:${q}`,"data-puck-dropzone":q,style:(0,cR.__spreadProps)((0,cR.__spreadValues)({},d),{"--puck-slot-min-empty-height":L,backgroundColor:null==d?void 0:d.backgroundColor}),children:[O&&P?(0,cS.jsx)(k8,{contentIds:C,zoneCompound:q,renderItem:a=>(0,cS.jsx)(lf,{zoneCompound:q,componentId:a.componentId,dragAxis:K,index:a.index,collisionAxis:g,inDroppableZone:z,itemRef:a.measureRef},a.componentId)}):C.map((a,b)=>(0,cS.jsx)(lf,{zoneCompound:q,componentId:a,dragAxis:K,index:b,collisionAxis:g,inDroppableZone:z},a)),(null==D?void 0:D.linePlaceholder)&&(0,cS.jsx)(lb,{zoneRef:w,contentIds:v,index:D.index})]})}),lh=({config:a,item:b,metadata:c})=>{let d=a.components[b.type],e=cF(a,b,b=>(0,cS.jsx)(cL,(0,cR.__spreadProps)((0,cR.__spreadValues)({},b),{config:a,metadata:c}))),f=(0,cv.useMemo)(()=>({areaId:e.id,depth:1}),[e]),g=cK(d.fields,e);return(0,cS.jsx)(kl,{value:f,children:(0,cS.jsx)(d.render,(0,cR.__spreadProps)((0,cR.__spreadValues)((0,cR.__spreadValues)({},e),g),{puck:(0,cR.__spreadProps)((0,cR.__spreadValues)({},e.puck),{renderDropZone:li,metadata:(0,cR.__spreadValues)((0,cR.__spreadValues)({},c),d.metadata)})}))},e.id)},li=a=>(0,cS.jsx)(lj,(0,cR.__spreadValues)({},a)),lj=(0,cv.forwardRef)(function({className:a,style:b,zone:c,as:d},e){let f=(0,cv.useContext)(ki),{areaId:g="root"}=f||{},{config:h,data:i,metadata:j}=(0,cv.useContext)(lm),k=`${g}:${c}`,l=(null==i?void 0:i.content)||[];return((0,cv.useEffect)(()=>{!l&&(null==f?void 0:f.registerZone)&&(null==f||f.registerZone(k))},[l]),i&&h)?(k!==cB.rootDroppableId&&(l=(0,cB.setupZone)(i,k).zones[k]),(0,cS.jsx)(null!=d?d:"div",{className:a,style:b,ref:e,children:l.map(a=>h.components[a.type]?(0,cS.jsx)(lh,{config:h,item:a,metadata:j},a.props.id):null)})):null}),lk=a=>(0,cS.jsx)(ll,(0,cR.__spreadValues)({},a)),ll=(0,cv.forwardRef)(function(a,b){let c=(0,cv.useContext)(ki);return(null==c?void 0:c.mode)==="edit"?(0,cS.jsx)(cS.Fragment,{children:(0,cS.jsx)(lg,(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{ref:b}))}):(0,cS.jsx)(cS.Fragment,{children:(0,cS.jsx)(lj,(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{ref:b}))})}),lm=cv.default.createContext({config:{components:{}},data:{root:{},content:[]},metadata:{}});function ln({config:a,data:b,metadata:c={}}){var d,e;let f=(0,cR.__spreadProps)((0,cR.__spreadValues)({},b),{root:b.root||{},content:b.content||[]}),g="props"in f.root?f.root.props:f.root,h=(null==g?void 0:g.title)||"",i=(0,cR.__spreadProps)((0,cR.__spreadValues)({},g),{puck:{renderDropZone:lk,isEditing:!1,dragRef:null,metadata:c},title:h,editMode:!1,id:"puck-root"}),j=cF(a,{type:"root",props:i},b=>(0,cS.jsx)(cN,(0,cR.__spreadProps)((0,cR.__spreadValues)({},b),{config:a,metadata:c}))),k=cK(null==(d=a.root)?void 0:d.fields,i),l=(0,cv.useMemo)(()=>({mode:"render",depth:0}),[]);return(null==(e=a.root)?void 0:e.render)?(0,cS.jsx)(lm.Provider,{value:{config:a,data:f,metadata:c},children:(0,cS.jsx)(kl,{value:l,children:(0,cS.jsx)(a.root.render,(0,cR.__spreadProps)((0,cR.__spreadValues)((0,cR.__spreadValues)({},j),k),{children:(0,cS.jsx)(li,{zone:cB.rootZone})}))})}):(0,cS.jsx)(lm.Provider,{value:{config:a,data:f,metadata:c},children:(0,cS.jsx)(kl,{value:l,children:(0,cS.jsx)(li,{zone:cB.rootZone})})})}(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var lo=(a,b)=>{let c={back:a.history.back,forward:a.history.forward,setHistories:a.history.setHistories,setHistoryIndex:a.history.setHistoryIndex,hasPast:a.history.hasPast(),hasFuture:a.history.hasFuture(),histories:a.history.histories,index:a.history.index},d={appState:(0,cQ.makeStatePublic)(a.state),config:a.config,dispatch:a.dispatch,getPermissions:a.permissions.getPermissions,refreshPermissions:a.permissions.refreshPermissions,resolveDataById:(a,c)=>(function(a,b,c){return(0,cR.__async)(this,null,function*(){let d=b().state.indexes.nodes[a];d?yield kI(d.data,b,c):console.warn(`Warning: Could not find component with id "${a}" to resolve its data. Component may have been removed or the id is invalid.`)})})(a,b,c),resolveDataBySelector:(a,c)=>(function(a,b,c){return(0,cR.__async)(this,null,function*(){let d=(0,cQ.getItem)(a,b().state);if(!d)return void console.warn(`Warning: Could not find component for selector "${JSON.stringify(a)}" to resolve its data. Component may have been removed or the selector is invalid.`);let e=(0,cB.toComponent)(d);yield kI(e,b,c)})})(a,b,c),history:c,selectedItem:a.selectedItem||null,getItemBySelector:b=>(0,cQ.getItem)(b,a.state),getItemById:b=>a.state.indexes.nodes[b].data,getSelectorForId:b=>kH(a.state,b),getParentById:b=>{let c=a.state.indexes.nodes[b].parentId;if(null===c)return;let d=a.state.indexes.nodes[c];if(d)return d.data},dictionary:a.dictionary};return d.__private={appState:a.state},d},lp=(0,cv.createContext)(null),lq=a=>({state:a.state,config:a.config,dispatch:a.dispatch,permissions:a.permissions,history:a.history,selectedItem:a.selectedItem,dictionary:a.dictionary});(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var lr=(0,cA.get_class_name_factory_default)("ComponentList",{ComponentList:"_ComponentList_htktj_1","ComponentList--isExpanded":"_ComponentList--isExpanded_htktj_5","ComponentList-content":"_ComponentList-content_htktj_9","ComponentList-title":"_ComponentList-title_htktj_17","ComponentList-titleIcon":"_ComponentList-titleIcon_htktj_63"}),ls=({name:a,label:b})=>{var c;let d=(0,cP.useAppStore)(a=>a.overrides),e=(0,cP.useAppStore)(b=>b.permissions.getPermissions({type:a}).insert);return(0,cv.useEffect)(()=>{d.componentItem&&console.warn("The `componentItem` override has been deprecated and renamed to `drawerItem`")},[d]),(0,cS.jsx)(kY.Item,{label:b,name:a,isDragDisabled:!e,children:null!=(c=d.componentItem)?c:d.drawerItem})},lt=({children:a,title:b,id:c})=>{let d=(0,cP.useAppStore)(a=>a.config),e=(0,cP.useAppStore)(a=>a.setUi),f=(0,cP.useAppStore)(a=>a.state.ui.componentList),{expanded:g=!0}=f[c]||{},h=`puck-drawer-category-${c}`,i=(0,cP.useMessage)("drawer-category-collapse",{title:null!=b?b:""}),j=(0,cP.useMessage)("drawer-category-expand",{title:null!=b?b:""});return(0,cS.jsxs)("div",{className:lr({isExpanded:g}),children:[b&&(0,cS.jsxs)("button",{type:"button",className:lr("title"),"aria-expanded":g,"aria-controls":h,onClick:()=>e({componentList:(0,cR.__spreadProps)((0,cR.__spreadValues)({},f),{[c]:(0,cR.__spreadProps)((0,cR.__spreadValues)({},f[c]),{expanded:!g})})}),title:g?i:j,children:[(0,cS.jsx)("div",{children:b}),(0,cS.jsx)("div",{className:lr("titleIcon"),children:g?(0,cS.jsx)(cP.ChevronUp,{size:12}):(0,cS.jsx)(cP.ChevronDown,{size:12})})]}),(0,cS.jsx)("div",{className:lr("content"),id:h,children:(0,cS.jsx)(kY,{children:a||Object.keys(d.components).map(a=>{var b;return(0,cS.jsx)(ls,{label:null!=(b=d.components[a].label)?b:a,name:a},a)})})})]})};lt.Item=ls;var lu=()=>{let a=(0,cP.useAppStore)(a=>a.overrides),b=(()=>{let[a,b]=(0,cv.useState)(),c=(0,cP.useAppStore)(a=>a.config),d=(0,cP.useAppStore)(a=>a.state.ui.componentList),e=(0,cP.useMessage)("drawer-category-other");return(0,cv.useEffect)(()=>{var a,f,g;if(Object.keys(d).length>0){let h,i=[];h=Object.entries(d).map(([a,b])=>{var d,e;return b.components?(b.components.forEach(a=>{i.push(a)}),!1===b.visible)?null:(0,cS.jsx)(lt,{id:a,title:(null==(e=null==(d=c.categories)?void 0:d[a])?void 0:e.title)||b.title||a,children:b.components.map((a,b)=>{var d;let e=c.components[a]||{};return(0,cS.jsx)(lt.Item,{label:null!=(d=e.label)?d:a,name:a,index:b},a)})},a):null});let j=Object.keys(c.components).filter(a=>-1===i.indexOf(a));!(j.length>0)||(null==(a=d.other)?void 0:a.components)||(null==(f=d.other)?void 0:f.visible)===!1||h.push((0,cS.jsx)(lt,{id:"other",title:(null==(g=d.other)?void 0:g.title)||e,children:j.map((a,b)=>{var d;let e=c.components[a]||{};return(0,cS.jsx)(lt.Item,{name:a,label:null!=(d=e.label)?d:a,index:b},a)})},"other")),b(h)}},[c.categories,c.components,d,e]),a})(),c=(0,cv.useMemo)(()=>(a.components&&console.warn("The `components` override has been deprecated and renamed to `drawer`"),a.components||a.drawer||"div"),[a]);return(0,cS.jsx)(c,{children:b||(0,cS.jsx)(lt,{id:"all"})})};(0,cR.init_react_import)();var lv=(0,cA.get_class_name_factory_default)("BlocksPlugin",{BlocksPlugin:"_BlocksPlugin_9af19_1"});(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var lw=(a,b,c)=>{var d;let[e,f]=a.split(":");if(!f)return;let g=null==(d=c[e])?void 0:d.data.type,h=g&&g!==cB.rootAreaId?b.components[g]:b.root;return function(a,b){let c;if("string"!=typeof a)throw Error(`Can't get field definition for path (${a}): Path should be a string`);if(!b||"object"!=typeof b)return;let d=a.split(/\.|\[\d+\]/).filter(Boolean),e=b;for(let a=0;a<d.length;a++){if(c=e[d[a]],a===d.length-1)return c;if(!c||("object"!==c.type||!c.objectFields)&&("array"!==c.type||!c.arrayFields))return;"object"===c.type&&(e=c.objectFields),"array"===c.type&&(e=c.arrayFields)}}(f,null==h?void 0:h.fields)},lx={},ly="outline-item",lz=(a,b,c)=>{let d=a.get(b);if(void 0!==d)return d;let e=c();return a.set(b,e),e},lA=(a,b,c,d,e)=>lz(a,`zone:${b}`,()=>kC(c,((a,b,c)=>{var d;if((null==(d=c.zones[a])?void 0:d.type)!=="slot")return lx;let e=lw(a,b,c.nodes);return(null==e?void 0:e.type)!=="slot"?lx:{allow:e.allow,disallow:e.disallow}})(b,d,e))),lB=(a,b)=>c=>{let d,e,f,g;if(c.type!==ly)return!1;let h=c.data,i=a.outlineStore.getState().acceptCache,{config:j,state:k}=a.appStore.getState(),l=k.indexes,m="row"===b.kind?b.itemId:b.zoneCompound.split(":")[0];return d=h.itemId,e=l.nodes,!lz(i,`subtree:${m}`,()=>{var a;return m===d||((null==(a=e[m])?void 0:a.path)||[]).some(a=>a.split(":")[0]===d)})&&("zone"===b.kind?lA(i,b.zoneCompound,h.componentType,j,l):lA(i,b.zoneCompound,h.componentType,j,l)||(f=b.itemId,g=h.componentType,lz(i,`childZones:${f}`,()=>Object.keys(l.zones).some(a=>a.startsWith(`${f}:`)&&lA(i,a,g,j,l)))))};(0,cR.init_react_import)();var lC=()=>{let a=null,b=null,c=()=>{null!==a&&(clearTimeout(a),a=null),b=null};return(0,cV.createStore)((d,e)=>({status:"idle",draggedRow:null,tempExpandedIds:new Set,expandCandidateId:null,indicator:null,drop:null,acceptCache:new Map,startDrag:a=>d({status:"dragging",draggedRow:a,acceptCache:new Map}),setTarget:(a,b)=>{var c,f,g,h;let i=e();((null==(c=i.indicator)?void 0:c.targetId)!==a.targetId||(null==(f=i.indicator)?void 0:f.position)!==a.position||(null==(g=i.drop)?void 0:g.zone)!==b.zone||(null==(h=i.drop)?void 0:h.index)!==b.index)&&d({indicator:a,drop:b})},clearTarget:()=>{(null!==e().indicator||null!==e().drop)&&d({indicator:null,drop:null})},scheduleExpand:(f,g)=>{b===f||e().tempExpandedIds.has(f)||(c(),b=f,d({expandCandidateId:f}),a=setTimeout(()=>{a=null,b=null,d(a=>({tempExpandedIds:new Set(a.tempExpandedIds).add(f),expandCandidateId:null})),g()},600))},cancelPendingExpand:()=>{c(),null!==e().expandCandidateId&&d({expandCandidateId:null})},endDrag:()=>{c(),d({status:"dropping",indicator:null,drop:null,expandCandidateId:null})},reset:()=>{c(),d({status:"idle",draggedRow:null,tempExpandedIds:new Set,expandCandidateId:null,indicator:null,drop:null,acceptCache:new Map})}}))},lD=(0,cv.createContext)(lC()),lE=()=>(0,cv.useContext)(lD),lF=({kind:a,zoneCompound:b})=>{let c=(0,cP.useAppStoreApi)(),d=lE(),e=`${a}:${b}`,{ref:f}=h1({id:e,type:"outline-zone",accept:(0,cv.useMemo)(()=>lB({appStore:c,outlineStore:d},{kind:"zone",zoneCompound:b}),[c,d,b]),collisionDetector:jA,data:{kind:"zone",zoneCompound:b}}),g=jl(lD,a=>{var b;return(null==(b=a.indicator)?void 0:b.targetId)===e});return(0,cv.useMemo)(()=>({isDropTarget:g,ref:f}),[g,f])};(0,cR.init_react_import)(),(0,cR.init_react_import)();var lG=(0,cA.get_class_name_factory_default)("DropLine",{DropLine:"_DropLine_eyz3q_2","DropLine--top":"_DropLine--top_eyz3q_12","DropLine--bottom":"_DropLine--bottom_eyz3q_16","DropLine--outset":"_DropLine--outset_eyz3q_20"}),lH=({edge:a,outset:b})=>(0,cS.jsx)("div",{className:lG({top:"top"===a,bottom:"bottom"===a,outset:!!b})});(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var lI=(...a)=>[...a].filter(Boolean).join(" ");(0,cR.init_react_import)();var lJ=(0,cA.get_class_name_factory_default)("LayerTree",{"LayerTree-helper":"_LayerTree-helper_1m7e4_2","LayerTree-helperRoot":"_LayerTree-helperRoot_1m7e4_11"}),lK=({zoneCompound:a})=>{let{ref:b,isDropTarget:c}=lF({kind:"empty",zoneCompound:a}),d=(0,cP.useMessage)("outline-empty"),[e]=a.split(":"),f=e===cB.rootAreaId;return(0,cS.jsxs)("li",{className:lI(lJ("helper"),f?lJ("helperRoot"):void 0),"data-puck-drop-target":c||void 0,ref:b,children:[d,c&&(0,cS.jsx)(lH,{edge:"top"})]})};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var lL=(0,cA.get_class_name_factory_default)("LayerActions",{LayerActions:"_LayerActions_d90t9_2","LayerActions--visible":"_LayerActions--visible_d90t9_18"}),lM=({node:a,visible:b})=>{let c=(0,cP.useAppStore)(a=>a.dispatch),d=lE(),e=(0,cP.useAppStore)(cU(b=>{let c=(0,cQ.getItem)({index:a.index,zone:a.zoneCompound},b.state),d=b.permissions.getPermissions({item:c});return{delete:d.delete,duplicate:d.duplicate}})),f=(0,cP.useMessage)("outline-item-duplicate"),g=(0,cP.useMessage)("outline-item-delete"),h=(0,cv.useCallback)(b=>{b.stopPropagation(),"idle"===d.getState().status&&c({type:"remove",index:a.index,zone:a.zoneCompound})},[c,d,a]),i=(0,cv.useCallback)(b=>{b.stopPropagation(),"idle"===d.getState().status&&c({type:"duplicate",sourceIndex:a.index,sourceZone:a.zoneCompound})},[c,d,a.index,a.zoneCompound]);return e.delete||e.duplicate?(0,cS.jsxs)("div",{className:lL({visible:b}),children:[e.duplicate&&(0,cS.jsx)(cP.IconButton,{onClick:i,title:f,type:"button",children:(0,cS.jsx)(cP.Copy,{})}),e.delete&&(0,cS.jsx)(cP.IconButton,{onClick:h,title:g,type:"button",children:(0,cS.jsx)(cP.Trash,{})})]}):null},lN=(0,cA.get_class_name_factory_default)("Layer",{Layer:"_Layer_onfgu_1","Layer-inner":"_Layer-inner_onfgu_8","Layer--isSortable":"_Layer--isSortable_onfgu_18","Layer-content":"_Layer-content_onfgu_22","Layer-clickable":"_Layer-clickable_onfgu_29","Layer-caret":"_Layer-caret_onfgu_57","Layer--containsZone":"_Layer--containsZone_onfgu_68","Layer-title":"_Layer-title_onfgu_76","Layer-name":"_Layer-name_onfgu_85","Layer-icon":"_Layer-icon_onfgu_91","Layer-zones":"_Layer-zones_onfgu_101","Layer--isExpanded":"_Layer--isExpanded_onfgu_106","Layer--isSelected":"_Layer--isSelected_onfgu_115","Layer--isExpandCandidate":"_Layer--isExpandCandidate_onfgu_138","Layer--isDragSource":"_Layer--isDragSource_onfgu_143"}),lO=(0,cv.forwardRef)(function({dataIndex:a,depth:b,isSelected:c,node:d,selectedId:e},f){let g=(0,cP.useAppStore)(a=>a.dispatch),h=(0,cP.useAppStore)(a=>{var b,c;return null!=(c=null==(b=a.state.ui.itemExpanded)?void 0:b[d.itemId])&&c}),i=jl(kj,a=>a.hoveringComponent===d.itemId),j=(0,cP.useAppStore)(a=>{var b;let c=(0,cQ.getItem)({index:d.index,zone:d.zoneCompound},a.state);return null==(b=a.permissions.getPermissions({item:c}))?void 0:b.drag}),{indicatorPosition:k,isDragSource:l,isExpandCandidate:m,isTempExpanded:n,rowRef:o}=(({componentType:a,index:b,itemId:c,zoneCompound:d})=>{let e=(0,cP.useAppStoreApi)(),f=lE(),g=(0,cv.useMemo)(()=>lB({appStore:e,outlineStore:f},{kind:"row",itemId:c,zoneCompound:d}),[e,f,c,d]),{handleRef:h,ref:i,isDragSource:j}=iS({id:c,index:b,group:d,type:ly,accept:g,data:{kind:"row",itemId:c,zoneCompound:d,index:b,componentType:a},collisionPriority:1,collisionDetector:(0,cv.useMemo)(()=>jD("y"),[]),transition:{duration:0},plugins:a=>[...a,gY.configure({feedback:"clone",dropAnimation:null})]}),{indicatorPosition:k,isExpandCandidate:l,isTempExpanded:m}=jl(lD,a=>{var b;return{indicatorPosition:(null==(b=a.indicator)?void 0:b.targetId)===c?a.indicator.position:null,isExpandCandidate:a.expandCandidateId===c,isTempExpanded:a.tempExpandedIds.has(c)}});return{rowRef:(0,cv.useCallback)(a=>{i(a),h(a)},[i,h]),isDragSource:j,indicatorPosition:k,isExpandCandidate:l,isTempExpanded:m}})({componentType:d.componentType,index:d.index,itemId:d.itemId,zoneCompound:d.zoneCompound}),p=(0,cv.useContext)(kj),q=lE(),r=(0,cP.useMessage)("outline-item-collapse"),s=(0,cP.useMessage)("outline-item-expand"),t=d.childZones.length>0,u=(0,cv.useCallback)(a=>{g({type:"setUi",ui:{itemSelector:a}})},[g]),v=h||n,w=1!==d.childZones.length;return(0,cS.jsxs)("li",{ref:f,className:lN({containsZone:t,isDragSource:l,isExpandCandidate:m,isExpanded:v,isHovering:i,isSelected:c,isSortable:j}),"data-index":a,"data-puck-layer-tree-id":d.itemId,children:[null!==k&&(0,cS.jsx)(lH,{edge:"before"===k?"top":"bottom",outset:!0}),(0,cS.jsxs)("div",{className:lN("inner"),ref:o,onMouseEnter:a=>{a.stopPropagation(),"idle"===q.getState().status&&p.setState({hoveringComponent:d.itemId})},onMouseLeave:a=>{a.stopPropagation(),p.setState({hoveringComponent:null})},children:[(0,cS.jsx)("div",{className:lN("caret"),children:(0,cS.jsx)(cP.IconButton,{onClick:a=>{a.stopPropagation(),"idle"===q.getState().status&&g({type:"setUi",ui:a=>{var b;let c=(0,cR.__spreadValues)({},a.itemExpanded);return(null==(b=a.itemExpanded)?void 0:b[d.itemId])?delete c[d.itemId]:c[d.itemId]=!0,{itemExpanded:c}},recordHistory:!1})},title:h?r:s,type:"button",children:(0,cS.jsx)(cP.ChevronRight,{})})}),(0,cS.jsxs)("div",{className:lN("content"),children:[(0,cS.jsx)("button",{type:"button",className:lN("clickable"),onClick:()=>{"idle"===q.getState().status&&(u({index:d.index,zone:d.zoneCompound}),p.getState().scrollToComponent(d.itemId))},children:(0,cS.jsxs)("div",{className:lN("title"),children:[(0,cS.jsx)("div",{className:lN("icon"),children:"Text"===d.componentType||"Heading"===d.componentType?(0,cS.jsx)(cP.Type,{}):(0,cS.jsx)(cP.LayoutGrid,{})}),(0,cS.jsx)("div",{className:lN("name"),children:d.label})]})}),(0,cS.jsx)(lM,{node:d,visible:i&&!l})]})]}),t&&v&&d.childZones.map(a=>(0,cS.jsx)("div",{className:lN("zones"),children:(0,cS.jsx)(lX,{depth:w?b+1:b,selectedId:e,tree:w?a:(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{label:void 0})})},a.zoneCompound))]})});(0,cR.init_react_import)();var lP={LayerTree:"_LayerTree_o5tyt_1","LayerTree--nested":"_LayerTree--nested_o5tyt_12"},lQ=(0,cA.get_class_name_factory_default)("LayerTree",lP),lR=({depth:a,selectedId:b,tree:c})=>(0,cS.jsxs)("ul",{className:lQ({nested:a>0}),children:[0===c.items.length&&(0,cS.jsx)(lK,{zoneCompound:c.zoneCompound}),c.items.map(c=>(0,cS.jsx)(lO,{depth:a,isSelected:b===c.itemId,node:c,selectedId:b},c.itemId))]});(0,cR.init_react_import)();var lS=(0,cA.get_class_name_factory_default)("LayerTree",lP),lT=new Map,lU=({depth:a,selectedId:b,tree:c})=>{let d=(0,cv.useRef)(null),e=jl(lD,a=>{var b;return(null==(b=a.draggedRow)?void 0:b.zoneCompound)===c.zoneCompound?a.draggedRow.index:null}),f=(0,cv.useCallback)(a=>{let b=i_(a);return null===e||b.includes(e)||(b.push(e),b.sort((a,b)=>a-b)),b},[e]),g=i9({count:c.items.length,estimateSize:a=>{var b,d;return b=c.items[a].itemId,null!=(d=lT.get(b))?d:32},getItemKey:a=>c.items[a].itemId,getScrollElement:()=>(a=>{var b;let c=null!=(b=null==a?void 0:a.parentElement)?b:null;for(;c;){let{overflow:a,overflowY:b}=getComputedStyle(c);if([a,b].some(a=>/auto|scroll/.test(a)))return c;c=c.parentElement}return null})(d.current),overscan:8,rangeExtractor:f,measureElement:a=>{let b=Math.ceil(a.getBoundingClientRect().height),c=a.dataset.puckLayerTreeId;return c&&(b<=0||lT.set(c,b)),b||32}}),h=g.getVirtualItems(),i=g.getTotalSize(),j=[],k=0,l=-1;h.forEach(d=>{let e=c.items[d.index],f=Math.max(d.start-k,0);f>0&&j.push((0,cS.jsx)("li",{"aria-hidden":"true",style:{height:`${f}px`}},`gap:${c.zoneCompound}:${l}:${d.index}`)),j.push((0,cS.jsx)(lO,{dataIndex:d.index,depth:a,isSelected:b===e.itemId,node:e,ref:g.measureElement,selectedId:b},e.itemId)),k=d.end,l=d.index});let m=Math.max(i-k,0);return m>0&&j.push((0,cS.jsx)("li",{"aria-hidden":"true",style:{height:`${m}px`}},`gap:${c.zoneCompound}:${l}:end`)),(0,cS.jsxs)("ul",{className:lS({nested:a>0}),ref:d,children:[0===c.items.length&&(0,cS.jsx)(lK,{zoneCompound:c.zoneCompound}),j]})};(0,cR.init_react_import)();var lV=(0,cA.get_class_name_factory_default)("LayerTree",{"LayerTree-zoneTitle":"_LayerTree-zoneTitle_fvhlh_2","LayerTree-zoneIcon":"_LayerTree-zoneIcon_fvhlh_19"}),lW=({label:a,zoneCompound:b})=>{let{ref:c,isDropTarget:d}=lF({kind:"label",zoneCompound:b});return(0,cS.jsxs)("div",{className:lV("zoneTitle"),"data-puck-drop-target":d||void 0,ref:c,children:[(0,cS.jsx)("div",{className:lV("zoneIcon"),children:(0,cS.jsx)(cP.Layers,{})}),a,d&&(0,cS.jsx)(lH,{edge:"bottom"})]})},lX=({depth:a,selectedId:b,tree:c})=>{let d=0===a&&c.items.length>=25;return(0,cS.jsxs)(cS.Fragment,{children:[c.label&&(0,cS.jsx)(lW,{label:c.label,zoneCompound:c.zoneCompound}),d?(0,cS.jsx)(lU,{depth:a,selectedId:b,tree:c}):(0,cS.jsx)(lR,{depth:a,selectedId:b,tree:c})]})};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var lY=a=>{if("u"<typeof document)return;let b=document.getElementById("preview-frame");a?null==b||b.setAttribute("data-puck-outline-dragging","true"):null==b||b.removeAttribute("data-puck-outline-dragging")},lZ=(a,b,c)=>{var d,e,f;let g=c.outlineDndStore.getState(),h=g.draggedRow;if(!h)return;let i=a.operation.target;if(!i){g.cancelPendingExpand(),g.clearTarget();return}let j=i.data;if("zone"===j.kind){g.cancelPendingExpand(),g.setTarget({targetId:i.id.toString(),position:"inside"},{zone:j.zoneCompound,index:0});return}let{config:k,state:l}=c.appStore.getState(),m=l.indexes;if(lA(g.acceptCache,j.zoneCompound,h.componentType,k,m)){let a=null==(d=b.collisionObserver.collisions[0])?void 0:d.data,c=jE(null==a?void 0:a.direction);g.setTarget({targetId:i.id.toString(),position:c},{zone:j.zoneCompound,index:jF({position:c,sourceIndex:h.index,targetIndex:j.index,isSameZone:j.zoneCompound===h.zoneCompound})})}else g.clearTarget();let n=!!(null==(e=l.ui.itemExpanded)?void 0:e[j.itemId])||g.tempExpandedIds.has(j.itemId),o=(f=j.itemId,Object.keys(m.zones).some(a=>a.startsWith(`${f}:`)));!n&&o?g.scheduleExpand(j.itemId,()=>{requestAnimationFrame(()=>b.collisionObserver.forceUpdate(!0))}):g.cancelPendingExpand()},l$=[],l_=({children:a})=>{let b=(0,cP.useAppStoreApi)(),c=(0,cv.useContext)(kj),[d]=(0,cv.useState)(()=>lC()),e=(0,cP.useAppStore)(a=>{var b,c;return null!=(c=null==(b=a.dnd)?void 0:b.disableOutlineDrag)&&c}),f=jv({mouse:[new hf.Distance({value:5})]}),g=(0,cv.useMemo)(()=>({outlineDndStore:d,appStore:b,scrollToComponent:a=>c.getState().scrollToComponent(a)}),[d,b,c]);return(0,cS.jsx)(lD.Provider,{value:d,children:(0,cS.jsx)(hL,{sensors:e?l$:f,onBeforeDragStart:a=>{((a,b)=>{let c=a.operation.source,d=null==c?void 0:c.data;if(!c||!d)return;let e=b.appStore.getState(),f=(0,cQ.getItem)({zone:d.zoneCompound,index:d.index},e.state);f&&e.permissions.getPermissions({item:f}).drag?(b.outlineDndStore.getState().startDrag({itemId:d.itemId,zoneCompound:d.zoneCompound,index:d.index,componentType:d.componentType}),lY(!0),e.dispatch({type:"setUi",ui:{isDragging:!0},recordHistory:!1})):a.preventDefault()})(a,g)},onDragOver:(a,b)=>{a.preventDefault(),lZ(a,b,g)},onDragMove:(a,b)=>{lZ(a,b,g)},onDragEnd:a=>{((a,b)=>{let{source:c}=a.operation,d=b.outlineDndStore.getState(),e=d.draggedRow,f=a.canceled?null:d.drop,g=b.appStore.getState().dispatch;if(lY(!1),e&&f){var h,i;let a,c,d,j;kJ(e.itemId,{zone:e.zoneCompound,index:e.index},{zone:f.zone,index:f.index},b.appStore);let k=f.zone!==e.zoneCompound||f.index!==e.index;g({type:"setUi",ui:{itemSelector:{zone:f.zone,index:f.index},isDragging:!1},recordHistory:k}),h=e.itemId,i=b.scrollToComponent,c=0,d=0,j=()=>{var b;let e=null==(b=kn())?void 0:b.querySelector(`[data-puck-component="${h}"]`),f=e?e.getBoundingClientRect().top:null;(c=f===a?c+1:0,a=f,d+=1,c>=2||d>=60)?i(h):requestAnimationFrame(j)},requestAnimationFrame(j)}else g({type:"setUi",ui:{isDragging:!1},recordHistory:!1});d.endDrag();let j=()=>b.outlineDndStore.getState().reset();if(c&&"idle"!==c.status){let a=dh(()=>{"idle"===c.status&&(j(),null==a||a())})}else j()})(a,g)},children:a})})};(0,cR.init_react_import)(),(0,cR.init_react_import)();var l0=a=>{let b={};return Object.keys(a).forEach(a=>{let[c]=a.split(":");c&&(b[c]||(b[c]=[]),b[c].push(a))}),b},l1=({config:a,label:b,nodes:c,zoneCompound:d,zones:e,zonesByParent:f=l0(e),componentFallbackLabel:g})=>{var h,i;return{items:(null!=(i=null==(h=e[d])?void 0:h.contentIds)?i:[]).map((b,g)=>(({config:a,itemId:b,index:c,nodes:d,zoneCompound:e,zones:f,zonesByParent:g,componentFallbackLabel:h})=>{var i,j,k,l;let m=d[b],n=null!=(j=null==(i=null==m?void 0:m.data.type)?void 0:i.toString())?j:h,o=null!=(l=null==(k=a.components[n])?void 0:k.label)?l:n;return{childZones:(g[b]||[]).map(b=>l1({config:a,nodes:d,zoneCompound:b,zones:f,zonesByParent:g})),componentType:n,index:c,itemId:b,label:o,zoneCompound:e}})({config:a,itemId:b,index:g,nodes:c,zoneCompound:d,zones:e,zonesByParent:f})),label:((a,b,c,d)=>{var e,f;if(void 0!==d)return d;let[,g]=a.split(":");if(g)return null!=(f=null==(e=lw(a,c,b))?void 0:e.label)?f:g})(d,c,a,b),zoneCompound:d}},l2=(0,cA.get_class_name_factory_default)("LayerTreeRoot",{LayerTreeRoot:"_LayerTreeRoot_1qowl_1"}),l3=({selectedId:a,trees:b})=>{let c=(0,cP.useAppStore)(a=>{var b,c;return null!=(c=null==(b=a.dnd)?void 0:b.disableOutlineDrag)&&c});return(0,cS.jsx)(l_,{children:(0,cS.jsx)("div",{className:l2(),"data-puck-dnd-disabled":c||void 0,children:b.map(b=>(0,cS.jsx)(lX,{depth:0,selectedId:a,tree:b},b.zoneCompound))})})};(0,cR.init_react_import)(),(0,cR.init_react_import)();var l4=(0,cA.get_class_name_factory_default)("CollapseAll",{CollapseAll:"_CollapseAll_1r4cy_1","CollapseAll-icon":"_CollapseAll-icon_1r4cy_5","CollapseAll--visible":"_CollapseAll--visible_1r4cy_10"}),l5=function({className:a}){let b=(0,cP.useAppStore)(a=>{var b;return Object.keys(null!=(b=a.state.ui.itemExpanded)?b:{}).length>0}),c=(0,cP.useAppStore)(a=>a.dispatch),d=(0,cP.useMessage)("outline-header-collapseall");return(0,cS.jsx)("div",{className:lI(l4({visible:b}),a),children:(0,cS.jsx)(cP.IconButton,{title:d,onClick:()=>{c({type:"setUi",ui:{itemExpanded:{}}})},children:(0,cS.jsx)(cP.ChevronsDownUp,{className:l4("icon")})})})};(0,cR.init_react_import)(),(0,cR.init_react_import)();var l6=(0,cA.get_class_name_factory_default)("OutlineHeader",{OutlineHeader:"_OutlineHeader_ntv8r_1"}),l7=({children:a,title:b})=>{let c=(0,cP.useMessage)("outline-header-title");return(0,cS.jsxs)("div",{className:l6(),children:[(0,cS.jsx)(jZ,{rank:"2",size:"xs",children:null!=c?c:b}),a]})};(0,cR.init_react_import)();var l8=(0,cA.get_class_name_factory_default)("OutlineWrapper",{OutlineWrapper:"_OutlineWrapper_b9ln0_1","OutlineWrapper-collapseAll":"_OutlineWrapper-collapseAll_b9ln0_9","OutlineWrapper-layers":"_OutlineWrapper-layers_b9ln0_15"}),l9=({children:a})=>(0,cS.jsx)("div",{className:l8(),children:a}),ma=()=>{let a=(0,cP.useAppStore)(a=>a.overrides.outline),b=(0,cP.useAppStore)(a=>a.config),c=(0,cP.useAppStore)(a=>a.state.indexes.nodes),d=(0,cP.useAppStore)(a=>a.state.indexes.zones),e=(0,cP.useAppStore)(a=>{var b;return(null==(b=a.selectedItem)?void 0:b.props.id)||null}),f=(0,cP.useMessage)("label-component"),g=(0,cP.useAppStore)(cU(a=>Object.keys(a.state.indexes.zones).filter(a=>"root"===a.split(":")[0]))),h=(0,cv.useMemo)(()=>g.map(a=>l1({config:b,label:1===g.length?"":a.split(":")[1],nodes:c,zoneCompound:a,zones:d,componentFallbackLabel:f})),[b,c,g,d,f]),i=(0,cv.useMemo)(()=>a||l9,[a]);return(0,cS.jsxs)(i,{children:[(0,cS.jsx)(l7,{children:(0,cS.jsx)(l5,{className:l8("collapseAll")})}),(0,cS.jsx)("div",{className:l8("layers"),children:(0,cS.jsx)(l3,{selectedId:e,trees:h})})]})};(0,cR.init_react_import)();var mb=(0,cA.get_class_name_factory_default)("OutlinePlugin",{OutlinePlugin:"_OutlinePlugin_1ylsc_1"});(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var mc=(0,cA.get_class_name_factory_default)("Breadcrumbs",{Breadcrumbs:"_Breadcrumbs_8c6w5_1","Breadcrumbs-breadcrumbLabel":"_Breadcrumbs-breadcrumbLabel_8c6w5_7","Breadcrumbs-breadcrumb":"_Breadcrumbs-breadcrumb_8c6w5_7"}),md=({children:a,numParents:b=1})=>{let c,d,e,f,g,h,i=(0,cP.useAppStore)(a=>a.setUi),j=(c=(0,cP.useAppStore)(a=>{var b;return null==(b=a.selectedItem)?void 0:b.props.id}),d=(0,cP.useAppStore)(a=>a.config),e=(0,cP.useAppStore)(a=>{var b;return null==(b=a.state.indexes.nodes[c])?void 0:b.path}),f=(0,cP.useAppStoreApi)(),g=(0,cP.useMessage)("label-page"),h=(0,cP.useMessage)("label-component"),(0,cv.useMemo)(()=>{let a=(null==e?void 0:e.map(a=>{var b,c,e,i;let[j]=a.split(":");if("root"===j)return{label:(null==(b=null==d?void 0:d.root)?void 0:b.label)||g,selector:null};let k=f.getState().state.indexes.nodes[j],l=k.path[k.path.length-1],m=((null==(c=f.getState().state.indexes.zones[l])?void 0:c.contentIds)||[]).indexOf(j);return{label:k?null!=(i=null==(e=d.components[k.data.type])?void 0:e.label)?i:k.data.type:h,selector:k?{index:m,zone:k.path[k.path.length-1]}:null}}))||[];return b?a.slice(a.length-b):a},[e,b,g,h]));return(0,cS.jsxs)("div",{className:mc(),children:[j.map((a,b)=>(0,cS.jsxs)("div",{className:mc("breadcrumb"),children:[(0,cS.jsx)("button",{type:"button",className:mc("breadcrumbLabel"),onClick:()=>i({itemSelector:a.selector}),children:a.label}),(0,cS.jsx)(cP.ChevronRight,{size:16})]},b)),a]})};(0,cR.init_react_import)(),(0,cR.init_react_import)();var me=(0,cA.get_class_name_factory_default)("PuckFields",{PuckFields:"_PuckFields_wnj25_1","PuckFields--isLoading":"_PuckFields--isLoading_wnj25_6","PuckFields-loadingOverlay":"_PuckFields-loadingOverlay_wnj25_10","PuckFields-loadingOverlayInner":"_PuckFields-loadingOverlayInner_wnj25_25","PuckFields-field":"_PuckFields-field_wnj25_32","PuckFields--wrapFields":"_PuckFields--wrapFields_wnj25_36"}),mf=({children:a})=>(0,cS.jsx)(cS.Fragment,{children:a}),mg=({fieldName:a})=>{let b=(0,cP.useAppStore)(b=>b.fields.fields[a]),c=(0,cP.useAppStore)(b=>((b.selectedItem?b.selectedItem.readOnly:b.state.data.root.readOnly)||{})[a]),d=(0,cP.useAppStore)(c=>b?c.selectedItem?`${c.selectedItem.props.id}_${b.type}_${a}`:`root_${b.type}_${a}`:null),e=(0,cP.useAppStore)(cU(a=>{let{selectedItem:b,permissions:c}=a;return b?c.getPermissions({item:b}):c.getPermissions({root:!0})})),f=(0,cP.useAppStoreApi)(),g=(0,cv.useCallback)((b,c)=>(0,cR.__async)(null,null,function*(){let{dispatch:d,state:e,selectedItem:g,resolveComponentData:h}=f.getState(),{data:i,ui:j}=e,{itemSelector:k}=j,l=i.root.props||i.root,m=g?g.props:l,n=(0,cR.__spreadProps)((0,cR.__spreadValues)({},m),{[a]:b});if(g&&k){let a=yield h((0,cR.__spreadProps)((0,cR.__spreadValues)({},g),{props:n}),"replace"),b=kH(f.getState().state,g.props.id);if(!b)return;d({type:"replace",destinationIndex:b.index,destinationZone:b.zone||cB.rootDroppableId,data:a.node,ui:c});return}d(i.root.props?{type:"replaceRoot",root:(yield h((0,cR.__spreadProps)((0,cR.__spreadValues)({},i.root),{props:n}),"replace")).node,ui:(0,cR.__spreadValues)((0,cR.__spreadValues)({},j),c),recordHistory:!0}:{type:"setData",data:{root:n}})}),[a]),{visible:h=!0}=null!=b?b:{},i=(0,cv.useContext)(jm.ctx);return((0,cv.useEffect)(()=>f.subscribe(b=>{var c;return null==(c=b.getCurrentData().props)?void 0:c[a]},b=>{i.setState({[a]:b})}),[f,i]),b&&d&&h&&"slot"!==b.type)?(0,cS.jsx)("div",{className:me("field"),children:(0,cS.jsx)(ke,{field:b,name:a,id:d,readOnly:!e.edit||c,onChange:g})},d):null},mh=(0,cv.memo)(({fieldName:a})=>{let b=(0,cP.useAppStoreApi)(),c=(0,cv.useMemo)(()=>{var c;let d=null==(c=b.getState().getCurrentData().props)?void 0:c[a];return{[a]:d}},[]);return(0,cS.jsx)(jm.Provider,{value:c,children:(0,cS.jsx)(mg,{fieldName:a})})}),mi=(0,cv.memo)(({wrapFields:a=!0})=>{let b=(0,cP.useAppStore)(a=>a.overrides),c=(0,cP.useAppStore)(a=>{var b,c;let d=a.selectedItem?null==(b=a.componentState[a.selectedItem.props.id])?void 0:b.loadingCount:null==(c=a.componentState.root)?void 0:c.loadingCount;return(null!=d?d:0)>0}),d=(0,cP.useAppStore)(cU(a=>a.state.ui.itemSelector)),e=(0,cP.useAppStore)(a=>{var b;return null==(b=a.selectedItem)?void 0:b.props.id}),f=(0,cP.useAppStoreApi)();(0,cP.useRegisterFieldsSlice)(f,e);let g=(0,cP.useAppStore)(a=>a.fields.loading),h=(0,cP.useAppStore)(cU(a=>a.fields.id===e?Object.keys(a.fields.fields):[])),i=g||c,j=(0,cv.useMemo)(()=>b.fields||mf,[b]);return(0,cS.jsxs)("form",{className:me({wrapFields:a}),onSubmit:a=>{a.preventDefault()},children:[(0,cS.jsx)(j,{isLoading:i,itemSelector:d,children:h.map(a=>(0,cS.jsx)(mh,{fieldName:a},a))}),i&&(0,cS.jsx)("div",{className:me("loadingOverlay"),children:(0,cS.jsx)("div",{className:me("loadingOverlayInner"),children:(0,cS.jsx)(cP.Loader,{size:16})})})]})});(0,cR.init_react_import)();var mj=(0,cA.get_class_name_factory_default)("FieldsPlugin",{FieldsPlugin:"_FieldsPlugin_18cj3_1","FieldsPlugin-header":"_FieldsPlugin-header_18cj3_7"}),mk=()=>{let a=(0,cP.useMessage)("label-page"),b=(0,cP.useAppStore)(a=>{var b,c;let d=a.selectedItem;return d?null!=(c=null==(b=a.config.components[d.type])?void 0:b.label)?c:d.type:null});return null!=b?b:a};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var ml=`@import "https://rsms.me/inter/inter.css";

/* styles/color.css */
@layer puck-tokens {
  :root {
    --puck-color-rose-01: #4a001c;
    --puck-color-rose-02: #670833;
    --puck-color-rose-03: #87114c;
    --puck-color-rose-04: #a81a66;
    --puck-color-rose-05: #bc5089;
    --puck-color-rose-06: #cc7ca5;
    --puck-color-rose-07: #d89aba;
    --puck-color-rose-08: #e3b8cf;
    --puck-color-rose-09: #efd6e3;
    --puck-color-rose-10: #f6eaf1;
    --puck-color-rose-11: #faf4f8;
    --puck-color-rose-12: #fef8fc;
    --puck-color-azure-01: #00175d;
    --puck-color-azure-02: #002c77;
    --puck-color-azure-03: #014292;
    --puck-color-azure-04: #0158ad;
    --puck-color-azure-05: #3479be;
    --puck-color-azure-06: #6499cf;
    --puck-color-azure-07: #88b0da;
    --puck-color-azure-08: #abc7e5;
    --puck-color-azure-09: #cfdff0;
    --puck-color-azure-10: #e7eef7;
    --puck-color-azure-11: #f3f6fb;
    --puck-color-azure-12: #f7faff;
    --puck-color-green-01: #002000;
    --puck-color-green-02: #043604;
    --puck-color-green-03: #084e08;
    --puck-color-green-04: #0c680c;
    --puck-color-green-05: #1d882f;
    --puck-color-green-06: #2faa53;
    --puck-color-green-07: #56c16f;
    --puck-color-green-08: #7dd78b;
    --puck-color-green-09: #b8e8bf;
    --puck-color-green-10: #ddf3e0;
    --puck-color-green-11: #eff8f0;
    --puck-color-green-12: #f3fcf4;
    --puck-color-yellow-01: #211000;
    --puck-color-yellow-02: #362700;
    --puck-color-yellow-03: #4c4000;
    --puck-color-yellow-04: #645a00;
    --puck-color-yellow-05: #877614;
    --puck-color-yellow-06: #ab9429;
    --puck-color-yellow-07: #bfac4e;
    --puck-color-yellow-08: #d4c474;
    --puck-color-yellow-09: #e6deb1;
    --puck-color-yellow-10: #f3efd9;
    --puck-color-yellow-11: #f9f7ed;
    --puck-color-yellow-12: #fcfaf0;
    --puck-color-red-01: #4c0000;
    --puck-color-red-02: #6a0a10;
    --puck-color-red-03: #8a1422;
    --puck-color-red-04: #ac1f35;
    --puck-color-red-05: #bf5366;
    --puck-color-red-06: #ce7e8e;
    --puck-color-red-07: #d99ca8;
    --puck-color-red-08: #e4b9c2;
    --puck-color-red-09: #efd7db;
    --puck-color-red-10: #f6eaec;
    --puck-color-red-11: #faf4f5;
    --puck-color-red-12: #fff9fa;
    --puck-color-grey-01: #181818;
    --puck-color-grey-02: #292929;
    --puck-color-grey-03: #404040;
    --puck-color-grey-04: #5a5a5a;
    --puck-color-grey-05: #767676;
    --puck-color-grey-06: #949494;
    --puck-color-grey-07: #ababab;
    --puck-color-grey-08: #c3c3c3;
    --puck-color-grey-09: #dcdcdc;
    --puck-color-grey-10: #efefef;
    --puck-color-grey-11: #f5f5f5;
    --puck-color-grey-12: #fafafa;
    --puck-color-black: #000000;
    --puck-color-white: #ffffff;
  }
}

/* styles/tokens.css */
@layer puck-tokens {
  :root {
    --puck-color-surface: var(--puck-color-white);
    --puck-color-surface-muted: var(--puck-color-grey-11);
    --puck-color-surface-subtle: var(--puck-color-grey-12);
    --puck-color-surface-inverse: var(--puck-color-grey-01);
    --puck-color-border: var(--puck-color-grey-09);
    --puck-color-border-hover: var(--puck-color-grey-05);
    --puck-color-border-muted: var(--puck-color-grey-10);
    --puck-color-border-inverse: var(--puck-color-grey-05);
    --puck-color-text: var(--puck-color-black);
    --puck-color-text-secondary: var(--puck-color-grey-04);
    --puck-color-text-muted: var(--puck-color-grey-05);
    --puck-color-text-subtle: var(--puck-color-grey-07);
    --puck-color-text-inverse: var(--puck-color-white);
    --puck-opacity-text-inverse: 0.75;
    --puck-color-interactive: var(--puck-color-azure-04);
    --puck-color-interactive-hover: var(--puck-color-azure-03);
    --puck-color-interactive-active: var(--puck-color-azure-02);
    --puck-color-interactive-subtle: var(--puck-color-azure-10);
    --puck-color-interactive-soft: var(--puck-color-azure-11);
    --puck-color-interactive-soft-hover: var(--puck-color-azure-12);
    --puck-color-interactive-neutral-hover: var(--puck-color-grey-10);
    --puck-color-interactive-inverse-hover: var(--puck-color-azure-06);
    --puck-color-interactive-inverse-active: var(--puck-color-azure-07);
    --puck-color-focus-ring: var(--puck-color-azure-05);
    --puck-color-selection-bg: color-mix( in srgb, var(--puck-color-azure-09) 30%, transparent );
    --puck-color-selection-border: var(--puck-color-azure-08);
    --puck-color-line-placeholder: var(--puck-color-azure-06);
    --puck-color-highlight: var(--puck-color-rose-07);
    --puck-color-bg-disabled: var(--puck-color-grey-07);
    --puck-color-text-disabled: var(--puck-color-grey-03);
    --puck-color-overlay-backdrop: color-mix( in srgb, var(--puck-color-black) 75%, transparent );
    --puck-space-1: 4px;
    --puck-space-2: 8px;
    --puck-space-3: 12px;
    --puck-space-4: 16px;
    --puck-space-5: 24px;
    --puck-space-chrome-gutter: var(--puck-space-4);
    --puck-radius-none: 0;
    --puck-radius-xs: 2px;
    --puck-radius-s: 3px;
    --puck-radius-m: 4px;
    --puck-radius-l: 8px;
    --puck-radius-pill: 30px;
    --puck-radius-round: 100%;
    --puck-border-width-hairline: 0.5px;
    --puck-border-width-regular: 1px;
    --puck-border-width-focus: 2px;
    --puck-border-width-strong: 4px;
    --puck-duration-fast: 50ms;
    --puck-duration-medium: 150ms;
    --puck-duration-slow: 250ms;
    --puck-ease-exit: ease-in;
    --puck-ease-emphasized: ease-in-out;
    --puck-ease-entrance: ease-out;
    --puck-font-weight-regular: 400;
    --puck-font-weight-medium: 500;
    --puck-font-weight-semibold: 600;
    --puck-font-weight-bold: 700;
    --puck-font-weight-heavy: 800;
    --puck-letter-spacing-ui: 0.05ch;
    --puck-letter-spacing-heading: 0.08ch;
    --puck-icon-size-xs: 14px;
    --puck-icon-size-s: 16px;
    --puck-icon-size-m: 18px;
    --puck-icon-size-l: 24px;
    --puck-space-m-unitless: 24;
    --puck-user-sidebar-left-width: var(--puck-sidebar-width);
    --puck-user-sidebar-right-width: var(--puck-sidebar-width);
    --puck-slot-min-empty-height: 128px;
    --puck-line-placeholder-width: 2px;
  }
}

/* styles/typography.css */
@layer puck-tokens {
  :root {
    --puck-font-size-scale-base-unitless: 12;
    --puck-font-size-xxxs-unitless: 12;
    --puck-font-size-xxs-unitless: 14;
    --puck-font-size-xs-unitless: 16;
    --puck-font-size-s-unitless: 18;
    --puck-font-size-m-unitless: 21;
    --puck-font-size-l-unitless: 24;
    --puck-font-size-xl-unitless: 28;
    --puck-font-size-xxl-unitless: 36;
    --puck-font-size-xxxl-unitless: 48;
    --puck-font-size-xxxxl-unitless: 56;
    --puck-font-size-xxxs: calc( 1rem * var(--puck-font-size-xxxs-unitless) / 16 );
    --puck-font-size-xxs: calc(1rem * var(--puck-font-size-xxs-unitless) / 16);
    --puck-font-size-xs: calc(1rem * var(--puck-font-size-xs-unitless) / 16);
    --puck-font-size-s: calc(1rem * var(--puck-font-size-s-unitless) / 16);
    --puck-font-size-m: calc(1rem * var(--puck-font-size-m-unitless) / 16);
    --puck-font-size-l: calc(1rem * var(--puck-font-size-l-unitless) / 16);
    --puck-font-size-xl: calc(1rem * var(--puck-font-size-xl-unitless) / 16);
    --puck-font-size-xxl: calc(1rem * var(--puck-font-size-xxl-unitless) / 16);
    --puck-font-size-xxxl: calc( 1rem * var(--puck-font-size-xxxl-unitless) / 16 );
    --puck-font-size-xxxxl: calc( 1rem * var(--puck-font-size-xxxxl-unitless) / 16 );
    --puck-font-size-base: var(--puck-font-size-xs);
    --puck-line-height-reset: 1;
    --puck-line-height-xs: calc( var(--puck-space-m-unitless) / var(--puck-font-size-m-unitless) );
    --puck-line-height-s: calc( var(--puck-space-m-unitless) / var(--puck-font-size-s-unitless) );
    --puck-line-height-m: calc( var(--puck-space-m-unitless) / var(--puck-font-size-xs-unitless) );
    --puck-line-height-l: calc( var(--puck-space-m-unitless) / var(--puck-font-size-xxs-unitless) );
    --puck-line-height-xl: calc( var(--puck-space-m-unitless) / var(--puck-font-size-scale-base-unitless) );
    --puck-line-height-base: var(--puck-line-height-m);
    --puck-fallback-font-stack:
      -apple-system,
      BlinkMacSystemFont,
      Segoe UI,
      Helvetica Neue,
      sans-serif,
      Apple Color Emoji,
      Segoe UI Emoji,
      Segoe UI Symbol;
    --puck-font-family: Inter, var(--puck-fallback-font-stack);
    --puck-font-family-monospaced:
      ui-monospace,
      "Cascadia Code",
      "Source Code Pro",
      Menlo,
      Consolas,
      "DejaVu Sans Mono",
      monospace;
  }
  @supports (font-variation-settings: normal) {
    :root {
      --puck-font-family: InterVariable, var(--puck-fallback-font-stack);
    }
  }
}

/* bundle/core.css */
:root {
  --_puck-styles-loaded: "true";
}
#frame-root {
  height: 1px;
  min-height: 100vh;
}
[data-puck-entry] {
  position: relative;
  z-index: 0;
}

/* bundle/index.css */

/* css-module:/home/runner/work/puck/puck/packages/core/components/ActionBar/styles.module.css/#css-module-data */
._ActionBar_5vdfr_1 {
  align-items: center;
  cursor: default;
  display: flex;
  width: auto;
  padding-top: var(--puck-actionbar-space-y, var(--puck-space-1));
  padding-bottom: var(--puck-actionbar-space-y, var(--puck-space-1));
  padding-inline-start: var(--puck-actionbar-space-x, 0);
  padding-inline-end: var(--puck-actionbar-space-x, 0);
  border-radius: var(--puck-actionbar-radius, var(--puck-radius-l));
  background: var(--puck-actionbar-color-bg, var(--puck-color-surface-inverse));
  color: var(--puck-color-text-inverse);
  font-family: var(--puck-font-family);
  min-height: 26px;
}
._ActionBar-label_5vdfr_17 {
  color: var(--puck-actionbar-color-text, var(--puck-color-text-inverse));
  font-size: var(--puck-actionbar-font-size, var(--puck-font-size-xxxs));
  opacity: var(--puck-actionbar-opacity-text, var(--puck-opacity-text-inverse));
  font-weight: var(--puck-font-weight-medium);
  padding-inline-start: var(--puck-space-2);
  padding-inline-end: var(--puck-space-2);
  margin-inline-start: var(--puck-space-1);
  margin-inline-end: var(--puck-space-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}
._ActionBarAction_5vdfr_30 + ._ActionBar-label_5vdfr_17 {
  padding-inline-start: 0;
}
._ActionBar-label_5vdfr_17 + ._ActionBarAction_5vdfr_30 {
  margin-inline-start: calc(var(--puck-space-1) * -1);
}
._ActionBar-group_5vdfr_38 {
  align-items: center;
  border-inline-start: var(--puck-border-width-hairline) solid var(--puck-actionbar-color-separator, var(--puck-color-border-inverse));
  display: flex;
  height: 100%;
  padding-inline-start: var(--puck-space-1);
  padding-inline-end: var(--puck-space-1);
}
._ActionBar-group_5vdfr_38:first-of-type {
  border-inline-start: 0;
}
._ActionBar-group_5vdfr_38:empty {
  display: none;
}
._ActionBarAction_5vdfr_30 {
  background: transparent;
  border: none;
  color: var(--puck-actionbar-color-text, var(--puck-color-text-inverse));
  cursor: pointer;
  padding: var(--puck-actionbar-action-space, 6px);
  margin-inline-start: var(--puck-space-1);
  margin-inline-end: var(--puck-space-1);
  border-radius: var(--puck-radius-m);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: var(--puck-actionbar-opacity-text, var(--puck-opacity-text-inverse));
  transition: color var(--puck-duration-fast) var(--puck-ease-exit), opacity var(--puck-duration-fast) var(--puck-ease-exit);
}
._ActionBarAction--disabled_5vdfr_74 {
  cursor: auto;
  color: var( --puck-actionbar-color-action-disabled, var(--puck-color-text-inverse) );
  opacity: var(--puck-actionbar-opacity-action-disabled, 0.54);
}
._ActionBarAction_5vdfr_30 svg {
  max-width: none !important;
}
._ActionBarAction_5vdfr_30:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: calc(var(--puck-border-width-focus) * -1);
}
@media (hover: hover) and (pointer: fine) {
  ._ActionBarAction_5vdfr_30:hover:not(._ActionBarAction--disabled_5vdfr_74) {
    color: var( --puck-actionbar-color-action-hover, var(--puck-color-interactive-inverse-hover) );
    opacity: 1;
    transition: none;
  }
}
._ActionBarAction_5vdfr_30:active:not(._ActionBarAction--disabled_5vdfr_74),
._ActionBarAction--active_5vdfr_104 {
  color: var( --puck-actionbar-color-action-active, var(--puck-color-interactive-inverse-active) );
  opacity: 1;
  transition: none;
}
._ActionBar-group_5vdfr_38 * {
  margin: 0;
}
._ActionBar-separator_5vdfr_117 {
  background: var( --puck-actionbar-color-separator, var(--puck-color-border-inverse) );
  margin-inline: var(--puck-space-1);
  width: var( --puck-border-width-hairline );
  height: 100%;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/AutoField/styles.module.css/#css-module-data */
._InputWrapper_qyenz_1 + ._InputWrapper_qyenz_1 {
  margin-top: var(--puck-space-3);
}
._Input-label_qyenz_5 {
  align-items: center;
  color: var(--puck-field-label-color-text, var(--puck-color-text-secondary));
  display: flex;
  padding-bottom: var(--puck-field-label-space-y, var(--puck-space-3));
  font-size: var(--puck-field-label-font-size, var(--puck-font-size-xxs));
  font-weight: var( --puck-field-label-font-weight, var(--puck-font-weight-semibold) );
}
._Input-labelIcon_qyenz_17 {
  color: var(--puck-field-label-color-icon, var(--puck-color-text-subtle));
  display: flex;
  margin-inline-end: var(--puck-space-1);
  padding-inline-start: var(--puck-space-1);
}
._Input-disabledIcon_qyenz_24 {
  color: var(--puck-color-text-muted);
  margin-inline-start: auto;
}
._Input-input_qyenz_29 {
  background: var(--puck-field-color-bg, var(--puck-color-surface));
  border-width: var( --puck-field-border-width, var(--puck-border-width-regular) );
  border-style: solid;
  border-color: var(--puck-field-color-border, var(--puck-color-border));
  border-radius: var(--puck-field-radius, var(--puck-radius-m));
  box-sizing: border-box;
  color: var(--puck-field-color-text, var(--puck-color-text));
  font-family: inherit;
  font-size: var(--puck-font-size-xs);
  padding: var(--puck-field-space-y, var(--puck-space-3)) var( --puck-field-space-x, calc( var(--puck-space-4) - var(--puck-field-border-width, var(--puck-border-width-regular)) ) );
  transition: border-color var(--puck-duration-fast) var(--puck-ease-exit);
  width: 100%;
  max-width: 100%;
}
@media (min-width: 458px) {
  ._Input-input_qyenz_29 {
    font-size: var(--puck-field-font-size, var(--puck-font-size-xxs));
  }
}
._Input-select_qyenz_61 {
  position: relative;
  width: 100%;
}
select._Input-input_qyenz_29 {
  appearance: none;
  cursor: pointer;
}
._Input-selectIcon_qyenz_71 {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  fill: var(--puck-field-color-border, var(--puck-color-border));
  stroke-width: 0;
}
._Input-selectIcon_qyenz_71:dir(rtl) {
  right: auto;
  left: 12px;
}
@media (hover: hover) and (pointer: fine) {
  ._Input_qyenz_1:has(> input):hover ._Input-input_qyenz_29:not([readonly]),
  ._Input_qyenz_1:has(> textarea):hover ._Input-input_qyenz_29:not([readonly]) {
    border-color: var( --puck-field-color-border-hover, var(--puck-color-border-hover) );
    transition: none;
  }
  ._Input_qyenz_1:has(> ._Input-select_qyenz_61):hover ._Input-input_qyenz_29:not([disabled]) {
    color: var( --puck-field-color-text-hover, var(--puck-field-color-text, var(--puck-color-text)) );
    background-color: var( --puck-field-color-bg-hover, var(--puck-color-interactive-soft-hover) );
    border-color: var( --puck-field-color-border-hover, var(--puck-color-border-hover) );
    transition: none;
  }
  ._Input_qyenz_1:not(._Input--readOnly_qyenz_111):has(> ._Input-select_qyenz_61):hover ._Input-selectIcon_qyenz_71 {
    fill: var(--puck-field-color-border-hover, var(--puck-color-border-hover));
  }
}
._Input-input_qyenz_29:focus {
  border-color: var( --puck-field-color-border-hover, var(--puck-color-border-hover) );
  outline: var(--puck-border-width-focus) solid var(--puck-field-color-border-focus, var(--puck-color-focus-ring));
  transition: none;
}
._Input--readOnly_qyenz_111 > ._Input-input_qyenz_29,
._Input--readOnly_qyenz_111 > ._Input-select_qyenz_61 > select._Input-input_qyenz_29 {
  background-color: var( --puck-field-color-bg-disabled, var(--puck-color-surface-muted) );
  border-color: var( --puck-field-color-border-disabled, var(--puck-color-border) );
  color: var( --puck-field-color-text-disabled, var(--puck-color-text-secondary) );
  cursor: default;
  opacity: 1;
  outline: 0;
  transition: none;
}
._Input--readOnly_qyenz_111 > ._Input-select_qyenz_61 > select._Input-input_qyenz_29 ~ ._Input-selectIcon_qyenz_71 {
  fill: var(--puck-field-color-text-disabled, var(--puck-color-text-secondary));
}
._Input-radioGroupItems_qyenz_150 {
  --_puck-field-radio-radius: var(--puck-field-radius, var(--puck-radius-m));
  --_puck-field-radio-border-width: var( --puck-field-border-width, var(--puck-border-width-regular) );
  --_puck-field-radio-border-color: var( --puck-field-color-border, var(--puck-color-border) );
  display: flex;
  border: var(--_puck-field-radio-border-width) solid var(--_puck-field-radio-border-color);
  border-radius: var(--_puck-field-radio-radius);
  flex-wrap: wrap;
}
._Input-radio_qyenz_150 {
  border-inline-end: var(--_puck-field-radio-border-width) solid var(--_puck-field-radio-border-color);
  flex-grow: 1;
}
._Input-radio_qyenz_150:first-of-type {
  border-bottom-left-radius: var(--_puck-field-radio-radius);
  border-top-left-radius: var(--_puck-field-radio-radius);
}
._Input-radio_qyenz_150:first-of-type ._Input-radioInner_qyenz_179 {
  border-bottom-left-radius: calc(var(--_puck-field-radio-radius) - var(--_puck-field-radio-border-width));
  border-top-left-radius: calc(var(--_puck-field-radio-radius) - var(--_puck-field-radio-border-width));
}
._Input-radio_qyenz_150:last-of-type {
  border-bottom-right-radius: var(--_puck-field-radio-radius);
  border-inline-end: 0;
  border-top-right-radius: var(--_puck-field-radio-radius);
}
._Input-radio_qyenz_150:last-of-type ._Input-radioInner_qyenz_179 {
  border-bottom-right-radius: calc(var(--_puck-field-radio-radius) - var(--_puck-field-radio-border-width));
  border-top-right-radius: calc(var(--_puck-field-radio-radius) - var(--_puck-field-radio-border-width));
}
._Input-radioInner_qyenz_179 {
  background-color: var(--puck-field-color-bg, var(--puck-color-surface));
  color: var(--puck-field-color-text, var(--puck-color-text));
  cursor: pointer;
  font-size: var(--puck-field-font-size, var(--puck-font-size-xxs));
  padding: var(--puck-field-space-y, var(--puck-space-3)) var( --puck-field-space-x, calc(var(--puck-space-4) - var(--_puck-field-radio-border-width)) );
  text-align: center;
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit), color var(--puck-duration-fast) var(--puck-ease-exit);
}
._Input-radio_qyenz_150:has(:focus-visible) {
  outline: var(--puck-border-width-focus) solid var(--puck-field-color-border-focus, var(--puck-color-focus-ring));
  outline-offset: var(--puck-border-width-focus);
  position: relative;
}
@media (hover: hover) and (pointer: fine) {
  ._Input-radioInner_qyenz_179:hover {
    background-color: var( --puck-field-color-bg-hover, var(--puck-color-interactive-soft-hover) );
    color: var( --puck-field-color-text-hover, var(--puck-field-color-text, var(--puck-color-text)) );
    transition: none;
  }
}
._Input--readOnly_qyenz_111 ._Input-radioGroupItems_qyenz_150 {
  border-color: var( --puck-field-color-border-disabled, var(--puck-color-border) );
}
._Input--readOnly_qyenz_111 ._Input-radioInner_qyenz_179 {
  background-color: var(--puck-field-color-bg, var(--puck-color-surface));
  color: var(--puck-field-color-text, var(--puck-color-text-secondary));
  cursor: default;
}
._Input--readOnly_qyenz_111 ._Input-radio_qyenz_150 {
  border-inline-end: var(--_puck-field-radio-border-width) solid var(--puck-field-color-border-disabled, var(--puck-color-border));
}
._Input--readOnly_qyenz_111 ._Input-radio_qyenz_150:last-of-type {
  border-inline-end: 0;
}
._Input-radio_qyenz_150 ._Input-radioInput_qyenz_261:checked ~ ._Input-radioInner_qyenz_179 {
  background-color: var( --puck-field-color-bg-active, var(--puck-color-interactive-soft) );
  color: var(--puck-field-color-text-active, var(--puck-color-interactive));
  font-weight: var(--puck-font-weight-medium);
}
._Input--readOnly_qyenz_111 ._Input-radioInput_qyenz_261:checked ~ ._Input-radioInner_qyenz_179 {
  background-color: var( --puck-field-color-bg-disabled, var(--puck-color-surface-muted) );
  color: var( --puck-field-color-text-disabled, var(--puck-color-text-secondary) );
}
._Input-radio_qyenz_150 ._Input-radioInput_qyenz_261 {
  clip: rect(0 0 0 0);
  clip-path: inset(100%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
textarea._Input-input_qyenz_29 {
  margin-bottom: calc(var(--puck-space-1) * -1);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/AutoField/fields/ArrayField/styles.module.css/#css-module-data */
._ArrayField_62huh_5 {
  --_puck-field-array-border-color: var( --puck-field-color-border, var(--puck-color-border) );
  --_puck-field-array-border-width: var( --puck-field-border-width, var(--puck-border-width-regular) );
  --_puck-field-array-radius: var(--puck-field-radius, var(--puck-radius-m));
  --_puck-field-array-radius-inner: calc( var(--_puck-field-array-radius) - var(--_puck-field-array-border-width) );
  display: flex;
  flex-direction: column;
  background: var( --puck-field-color-bg-active, var(--puck-color-interactive-soft) );
  border: var(--_puck-field-array-border-width) solid var(--_puck-field-array-border-color);
  border-radius: var(--_puck-field-array-radius);
}
._ArrayField--isDraggingFrom_62huh_30 {
  background-color: var( --puck-field-color-bg-active, var(--puck-color-interactive-soft) );
  overflow: hidden;
}
._ArrayField-addButton_62huh_38 {
  background-color: var(--puck-field-color-bg, var(--puck-color-surface));
  border: none;
  border-radius: var(--_puck-field-array-radius-inner);
  display: flex;
  color: var(--puck-field-array-add-color-icon, var(--puck-color-interactive));
  justify-content: center;
  cursor: pointer;
  width: 100%;
  margin: 0;
  padding: calc(var(--puck-field-space-y, var(--puck-space-3)) + 2px) var( --puck-field-space-x, calc(var(--puck-space-4) - var(--_puck-field-array-border-width)) );
  text-align: left;
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit);
}
._ArrayField--hasItems_62huh_58 > ._ArrayField-addButton_62huh_38 {
  border-top: var(--_puck-field-array-border-width) solid var(--_puck-field-array-border-color);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
._ArrayField-addButton_62huh_38:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
  position: relative;
}
@media (hover: hover) and (pointer: fine) {
  ._ArrayField_62huh_5:not(._ArrayField--isDraggingFrom_62huh_30) > ._ArrayField-addButton_62huh_38:hover {
    background: var( --puck-field-color-bg-hover, var(--puck-color-interactive-soft-hover) );
    color: var( --puck-field-color-text-hover, var(--puck-field-color-text, var(--puck-color-text)) );
    transition: none;
  }
}
._ArrayField_62huh_5:not(._ArrayField--isDraggingFrom_62huh_30) > ._ArrayField-addButton_62huh_38:active {
  background: var( --puck-field-color-bg-hover, var(--puck-color-interactive-soft-hover) );
  transition: none;
}
._ArrayField-inner_62huh_93 {
  margin-top: -1px;
}
._ArrayFieldItem_62huh_101 {
  display: block;
  position: relative;
  border-top-left-radius: var(--_puck-field-array-radius-inner);
  border-top-right-radius: var(--_puck-field-array-radius-inner);
  border-top: var(--_puck-field-array-border-width) solid var(--_puck-field-array-border-color);
}
._ArrayFieldItem--isDragging_62huh_110 {
  border-top: transparent;
}
._ArrayFieldItem--isExpanded_62huh_114::before {
  display: none;
}
._ArrayFieldItem--isExpanded_62huh_114 {
  border-bottom: 0;
  outline-offset: 0px !important;
  outline: var(--_puck-field-array-border-width) solid var(--puck-field-color-border-focus, var(--puck-color-focus-ring)) !important;
  z-index: 2;
}
._ArrayFieldItem--isDragging_62huh_110 {
  outline: var(--puck-border-width-focus) var(--puck-field-color-border-dragging, var(--puck-color-selection-border)) solid !important;
}
._ArrayFieldItem--isDragging_62huh_110 ._ArrayFieldItem-summary_62huh_132:active {
  background-color: var(--puck-field-color-bg, var(--puck-color-surface));
}
._ArrayFieldItem_62huh_101 + ._ArrayFieldItem_62huh_101 {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
._ArrayFieldItem-summary_62huh_132 {
  --_puck-drag-icon-color: var(--puck-field-color-text, var(--puck-color-text));
  --_puck-drag-icon-color-hover: var( --puck-field-color-text-hover, var(--puck-field-color-text, var(--puck-color-text)) );
  background: var(--puck-field-color-bg, var(--puck-color-surface));
  color: var(--puck-field-color-text, var(--puck-color-text));
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  justify-content: space-between;
  font-size: var(--puck-field-font-size, var(--puck-font-size-xxs));
  list-style: none;
  padding: var(--puck-field-space-y, var(--puck-space-3)) var( --puck-field-space-x, calc(var(--puck-space-4) - var(--_puck-field-array-border-width)) );
  position: relative;
  overflow: hidden;
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit);
}
._ArrayFieldItem--noFields_62huh_167 > ._ArrayFieldItem-summary_62huh_132 {
  cursor: grab;
}
._ArrayFieldItem_62huh_101:first-of-type > ._ArrayFieldItem-summary_62huh_132 {
  border-top-left-radius: var(--_puck-field-array-radius-inner);
  border-top-right-radius: var(--_puck-field-array-radius-inner);
}
._ArrayField--addDisabled_62huh_176 > ._ArrayField-inner_62huh_93 > ._ArrayFieldItem_62huh_101:last-of-type:not(._ArrayFieldItem--isExpanded_62huh_114) > ._ArrayFieldItem-summary_62huh_132 {
  border-bottom-left-radius: var(--_puck-field-array-radius-inner);
  border-bottom-right-radius: var(--_puck-field-array-radius-inner);
}
._ArrayField--addDisabled_62huh_176 > ._ArrayField-inner_62huh_93 > ._ArrayFieldItem--isExpanded_62huh_114:last-of-type {
  border-bottom-left-radius: var(--_puck-field-array-radius-inner);
  border-bottom-right-radius: var(--_puck-field-array-radius-inner);
}
._ArrayFieldItem-summary_62huh_132:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
}
@media (hover: hover) and (pointer: fine) {
  ._ArrayFieldItem-summary_62huh_132:hover {
    background-color: var( --puck-field-color-bg-hover, var(--puck-color-interactive-soft-hover) );
    color: var( --puck-field-color-text-hover, var(--puck-field-color-text, var(--puck-color-text)) );
    transition: none;
  }
}
._ArrayFieldItem-summary_62huh_132:active {
  background-color: var( --puck-field-color-bg-hover, var(--puck-color-interactive-soft-hover) );
  transition: none;
}
._ArrayFieldItem--isExpanded_62huh_114 > ._ArrayFieldItem-summary_62huh_132 {
  background: var( --puck-field-color-bg-active, var(--puck-color-interactive-soft) );
  color: var(--puck-field-color-text-active, var(--puck-color-interactive));
  font-weight: var(--puck-font-weight-semibold);
  transition: none;
}
._ArrayFieldItem-body_62huh_228 {
  background: var(--puck-field-color-surface, var(--puck-color-surface));
  display: none;
}
._ArrayFieldItem--isExpanded_62huh_114 > ._ArrayFieldItem-body_62huh_228 {
  display: block;
}
._ArrayFieldItem-fieldset_62huh_237 {
  border: none;
  border-top: var(--_puck-field-array-border-width) solid var(--_puck-field-array-border-color);
  margin: 0;
  min-width: 0;
  padding: var(--puck-field-space-surface-y, var(--puck-space-4)) var( --puck-field-space-surface-x, calc(var(--puck-space-4) - var(--_puck-field-array-border-width)) );
}
._ArrayFieldItem-rhs_62huh_250 {
  display: flex;
  gap: var(--puck-space-1);
  align-items: center;
}
._ArrayFieldItem-actions_62huh_256 {
  color: var(--puck-color-text-secondary);
  display: flex;
  gap: var(--puck-space-1);
  opacity: 0;
}
._ArrayFieldItem-summary_62huh_132:focus-within > ._ArrayFieldItem-rhs_62huh_250 > ._ArrayFieldItem-actions_62huh_256,
._ArrayFieldItem-summary_62huh_132:hover > ._ArrayFieldItem-rhs_62huh_250 > ._ArrayFieldItem-actions_62huh_256 {
  opacity: 1;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/IconButton/IconButton.module.css/#css-module-data */
._IconButton_1pxxt_1 {
  align-items: center;
  background: var(--puck-iconbutton-color-bg, transparent);
  border: none;
  border-radius: var(--puck-iconbutton-radius, var(--puck-radius-m));
  color: var(--puck-iconbutton-color-icon, currentColor);
  display: flex;
  font-family: var(--puck-font-family);
  justify-content: center;
  padding: var(--puck-iconbutton-space, var(--puck-space-1));
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit), color var(--puck-duration-fast) var(--puck-ease-exit);
}
._IconButton--active_1pxxt_15 {
  color: var( --puck-iconbutton-color-icon-active, var(--puck-color-interactive) );
}
._IconButton_1pxxt_1:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: calc(var(--puck-border-width-focus) * -1);
}
@media (hover: hover) and (pointer: fine) {
  ._IconButton_1pxxt_1:hover:not(._IconButton--disabled_1pxxt_28) {
    background: var( --_puck-iconbutton-color-bg-hover, var( --puck-iconbutton-color-bg-hover, var(--puck-color-interactive-neutral-hover) ) );
    color: var( --puck-iconbutton-color-icon-hover, var(--puck-color-interactive) );
    cursor: pointer;
    transition: none;
  }
}
._IconButton_1pxxt_1:active {
  background: var( --puck-iconbutton-color-bg-active, var(--puck-color-interactive-soft) );
  transition: none;
}
._IconButton--disabled_1pxxt_28 {
  color: var( --puck-iconbutton-color-icon-disabled, var(--puck-color-text-subtle) );
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Loader/styles.module.css/#css-module-data */
@keyframes _loader-animation_1w5zn_1 {
  0% {
    transform: rotate(0deg) scale(1);
  }
  50% {
    transform: rotate(180deg) scale(0.8);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}
._Loader_1w5zn_13 {
  background: transparent;
  border-radius: var(--puck-radius-round);
  border: var(--puck-border-width-focus) solid currentColor;
  border-bottom-color: transparent;
  display: inline-block;
  animation: _loader-animation_1w5zn_1 1s 0s infinite linear;
  animation-fill-mode: both;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/DragIcon/styles.module.css/#css-module-data */
._DragIcon_5e515_1 {
  color: var(--_puck-drag-icon-color, var(--puck-color-text-muted));
  cursor: grab;
  padding: var(--puck-space-1);
  border-radius: var(--puck-radius-m);
}
._DragIcon--disabled_5e515_10 {
  cursor: no-drop;
}
@media (hover: hover) and (pointer: fine) {
  ._DragIcon_5e515_1:not(._DragIcon--disabled_5e515_10):hover {
    color: var(--_puck-drag-icon-color-hover, var(--puck-color-focus-ring));
  }
}

/* components/Sortable/styles.css */
[data-dnd-placeholder]:not([data-puck-line-drag] *) * {
  opacity: 0 !important;
}
[data-dnd-placeholder]:not([data-puck-line-drag] *) {
  background: var( --_puck-field-array-color-placeholder, var(--puck-color-azure-06) ) !important;
  border: none !important;
  color: transparent !important;
  opacity: 0.3 !important;
  outline: none !important;
  transition: none !important;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/ExternalInput/styles.module.css/#css-module-data */
._ExternalInput-actions_143vl_1 {
  display: flex;
}
._ExternalInput-button_143vl_5 {
  display: flex;
  gap: var(--puck-space-2);
  align-items: center;
  justify-content: center;
  background-color: var(--puck-field-color-bg, var(--puck-color-surface));
  border: var(--puck-field-border-width, var(--puck-border-width-regular)) solid var(--puck-field-color-border, var(--puck-color-border));
  border-radius: var(--puck-field-radius, var(--puck-radius-m));
  color: var(--puck-field-color-text-active, var(--puck-color-interactive));
  padding: var(--puck-field-space-y, var(--puck-space-3)) var( --puck-field-space-x, calc( var(--puck-space-4) - var(--puck-field-border-width, var(--puck-border-width-regular)) ) );
  font-size: var(--puck-field-font-size, var(--puck-font-size-xxs));
  font-weight: var(--puck-font-weight-medium);
  white-space: nowrap;
  text-overflow: ellipsis;
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit);
  position: relative;
  overflow: hidden;
  flex-grow: 1;
  cursor: pointer;
}
._ExternalInput--dataSelected_143vl_34 ._ExternalInput-button_143vl_5 {
  color: var(--puck-field-color-text, var(--puck-color-text));
  display: block;
  border-top-right-radius: 0px;
  border-bottom-right-radius: 0px;
}
._ExternalInput--readOnly_143vl_41 ._ExternalInput-button_143vl_5 {
  background-color: var( --puck-field-color-bg-disabled, var(--puck-color-surface-muted) );
}
._ExternalInput-detachButton_143vl_48 {
  border: var(--puck-field-border-width, var(--puck-border-width-regular)) solid var(--puck-field-color-border, var(--puck-color-border));
  border-top-right-radius: var(--puck-field-radius, var(--puck-radius-m));
  border-bottom-right-radius: var(--puck-field-radius, var(--puck-radius-m));
  background-color: var( --puck-field-external-detach-color-bg, var(--puck-color-surface-subtle) );
  color: var( --puck-field-external-detach-color-text, var(--puck-color-text-muted) );
  display: flex;
  gap: var(--puck-space-2);
  align-items: center;
  justify-content: center;
  padding: var(--puck-space-2) var(--puck-space-3);
  position: relative;
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit), color var(--puck-duration-fast) var(--puck-ease-exit);
  margin-inline-start: -1px;
  cursor: pointer;
}
._ExternalInput-button_143vl_5:focus-visible,
._ExternalInput-detachButton_143vl_48:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
  z-index: 1;
}
@media (hover: hover) and (pointer: fine) {
  ._ExternalInput_143vl_1:not(._ExternalInput--readOnly_143vl_41) ._ExternalInput-button_143vl_5:hover,
  ._ExternalInput_143vl_1:not(._ExternalInput--readOnly_143vl_41) ._ExternalInput-detachButton_143vl_48:hover {
    background: var( --puck-field-color-bg-hover, var(--puck-color-interactive-soft-hover) );
    transition: none;
  }
  ._ExternalInput_143vl_1:not(._ExternalInput--readOnly_143vl_41) ._ExternalInput-detachButton_143vl_48:hover {
    color: var( --puck-field-color-text-hover, var(--puck-field-external-detach-color-text, var(--puck-color-text-muted)) );
  }
  ._ExternalInput--dataSelected_143vl_34:not(._ExternalInput--readOnly_143vl_41) ._ExternalInput-button_143vl_5:hover {
    color: var( --puck-field-color-text-hover, var(--puck-field-color-text, var(--puck-color-text)) );
  }
}
._ExternalInput_143vl_1:not(._ExternalInput--readOnly_143vl_41) ._ExternalInput-button_143vl_5:active,
._ExternalInput_143vl_1:not(._ExternalInput--readOnly_143vl_41) ._ExternalInput-detachButton_143vl_48:active {
  background: var( --puck-field-color-bg-hover, var(--puck-color-interactive-soft-hover) );
  transition: none;
}
._ExternalInputModal_143vl_118 {
  color: var(--puck-color-text);
  display: grid;
  grid-template-rows: min-content minmax(128px, 100%) min-content;
  grid-template-columns: 100%;
  position: relative;
  min-height: 50dvh;
  max-height: 90dvh;
}
._ExternalInputModal-grid_143vl_128 {
  display: flex;
  flex-direction: column;
}
@media (min-width: 458px) {
  ._ExternalInputModal-grid_143vl_128 {
    display: grid;
    grid-template-columns: 100%;
  }
  ._ExternalInputModal--filtersToggled_143vl_139 ._ExternalInputModal-grid_143vl_128 {
    grid-template-columns: 25% 75%;
  }
}
._ExternalInputModal-filters_143vl_144 {
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
}
._ExternalInputModal--filtersToggled_143vl_139 ._ExternalInputModal-filters_143vl_144 {
  display: none;
}
@media (min-width: 458px) {
  ._ExternalInputModal-filters_143vl_144 {
    border-inline-end: var(--puck-border-width-regular) solid var(--puck-color-border);
    display: none;
  }
  ._ExternalInputModal--filtersToggled_143vl_139 ._ExternalInputModal-filters_143vl_144 {
    display: block;
  }
}
._ExternalInputModal-masthead_143vl_164 {
  background-color: var(--puck-color-surface-subtle);
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
  display: flex;
  flex-wrap: wrap;
  gap: var(--puck-space-5);
  padding: var(--puck-space-5);
}
._ExternalInputModal-tableWrapper_143vl_173 {
  position: relative;
  overflow-x: auto;
  overflow-y: auto;
  flex-grow: 1;
}
._ExternalInputModal-table_143vl_173 {
  border-collapse: unset;
  border-spacing: 0px;
  color: var(--puck-color-text);
  position: relative;
  z-index: 0;
  min-width: 100%;
}
._ExternalInputModal-thead_143vl_189 {
  background-color: var(--puck-color-surface);
  position: sticky;
  top: 0;
  z-index: 1;
}
._ExternalInputModal-th_143vl_189 {
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
  color: var(--puck-color-text-secondary);
  font-weight: var(--puck-font-weight-medium);
  font-size: var(--puck-font-size-xxs);
  padding: var(--puck-space-4) var(--puck-space-5);
}
._ExternalInputModal-td_143vl_204 {
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border-muted);
  padding: var(--puck-space-4) var(--puck-space-5);
}
._ExternalInputModal-tr_143vl_210 ._ExternalInputModal-td_143vl_204:first-of-type {
  font-weight: var(--puck-font-weight-medium);
  width: 1%;
  white-space: nowrap;
}
@media (hover: hover) and (pointer: fine) {
  ._ExternalInputModal-tbody_143vl_217 ._ExternalInputModal-tr_143vl_210:hover {
    background: var(--puck-color-interactive-soft-hover);
    color: var(--puck-color-interactive);
    cursor: pointer;
    position: relative;
    margin-inline-start: -5px;
  }
  ._ExternalInputModal-tbody_143vl_217 ._ExternalInputModal-tr_143vl_210:hover ._ExternalInputModal-td_143vl_204:first-of-type {
    border-inline-start: var(--puck-border-width-strong) solid var(--puck-color-interactive);
    padding-inline-start: 20px;
  }
}
._ExternalInputModal-tbody_143vl_217 ._ExternalInputModal-tr_143vl_210:last-of-type ._ExternalInputModal-td_143vl_204 {
  border-bottom: none;
}
._ExternalInputModal-tableWrapper_143vl_173 {
  display: none;
}
._ExternalInputModal--hasData_143vl_244 ._ExternalInputModal-tableWrapper_143vl_173 {
  display: block;
}
._ExternalInputModal-loadingBanner_143vl_248 {
  display: none;
  background-color: color-mix(in srgb, var(--puck-color-surface) 90%, transparent);
  padding: 64px;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
._ExternalInputModal--isLoading_143vl_265 ._ExternalInputModal-loadingBanner_143vl_248 {
  display: flex;
}
._ExternalInputModal-searchForm_143vl_269 {
  display: flex;
  flex-wrap: wrap;
  gap: var(--puck-space-3);
  flex-grow: 1;
}
@media (min-width: 458px) {
  ._ExternalInputModal-searchForm_143vl_269 {
    flex-wrap: nowrap;
  }
}
._ExternalInputModal-search_143vl_269 {
  display: flex;
  background: var(--puck-color-surface);
  border-width: var(--puck-border-width-regular);
  border-style: solid;
  border-color: var(--puck-color-border);
  border-radius: var(--puck-radius-m);
  flex-grow: 1;
  transition: border-color var(--puck-duration-fast) var(--puck-ease-exit);
}
._ExternalInputModal-search_143vl_269:focus-within {
  border-color: var(--puck-color-border-hover);
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  transition: none;
}
@media (hover: hover) and (pointer: fine) {
  ._ExternalInputModal-search_143vl_269:hover {
    border-color: var(--puck-color-border-hover);
    transition: none;
  }
}
._ExternalInputModal-searchIcon_143vl_306 {
  align-items: center;
  background: var(--puck-color-surface-subtle);
  border-bottom-left-radius: var(--puck-radius-m);
  border-top-left-radius: var(--puck-radius-m);
  border-inline-end: var(--puck-border-width-regular) solid var(--puck-color-border);
  color: var(--puck-color-text-subtle);
  display: flex;
  justify-content: center;
  padding: var(--puck-space-3) calc(var(--puck-space-4) - var(--puck-border-width-regular));
  transition: color var(--puck-duration-fast) var(--puck-ease-exit);
}
._ExternalInputModal-search_143vl_269:focus-within ._ExternalInputModal-searchIcon_143vl_306 {
  color: var(--puck-color-text-secondary);
  transition: none;
}
@media (hover: hover) and (pointer: fine) {
  ._ExternalInputModal-search_143vl_269:hover ._ExternalInputModal-searchIcon_143vl_306 {
    color: var(--puck-color-text-secondary);
    transition: none;
  }
}
._ExternalInputModal-searchIconText_143vl_333 {
  clip: rect(0 0 0 0);
  clip-path: inset(100%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
._ExternalInputModal-searchInput_143vl_343 {
  border: none;
  border-radius: var(--puck-radius-m);
  background: var(--puck-color-surface);
  font-family: inherit;
  font-size: var(--puck-font-size-xxs);
  padding: var(--puck-space-3) calc(var(--puck-space-4) - var(--puck-border-width-regular));
  width: 100%;
}
._ExternalInputModal-searchInput_143vl_343:focus {
  outline: 0;
}
._ExternalInputModal-searchActions_143vl_358 {
  display: flex;
  gap: var(--puck-space-2);
  height: 44px;
  width: 100%;
}
@media (min-width: 458px) {
  ._ExternalInputModal-searchActions_143vl_358 {
    width: auto;
  }
}
._ExternalInputModal-searchActionIcon_143vl_371 {
  align-self: center;
}
._ExternalInputModal-footerContainer_143vl_375 {
  background-color: var(--puck-color-surface-subtle);
  border-top: var(--puck-border-width-regular) solid var(--puck-color-border);
  color: var(--puck-color-text-secondary);
  padding: var(--puck-space-4);
}
._ExternalInputModal-footer_143vl_375 {
  font-weight: var(--puck-font-weight-medium);
  font-size: var(--puck-font-size-xxs);
  text-align: right;
}
._ExternalInputModal-field_143vl_388 {
  color: var(--puck-color-text-secondary);
  margin: var(--puck-space-4);
  margin-bottom: var(--puck-space-3);
  display: block;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Modal/styles.module.css/#css-module-data */
._Modal_g5xob_1 {
  background: var(--puck-color-overlay-backdrop);
  display: none;
  justify-content: center;
  align-items: center;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  z-index: 1;
  padding: 32px;
}
._Modal--isOpen_g5xob_15 {
  display: flex;
}
._Modal-inner_g5xob_19 {
  width: 100%;
  max-width: 1024px;
  border-radius: var(--puck-radius-l);
  overflow: hidden;
  background: var(--puck-color-surface);
  display: flex;
  flex-direction: column;
  max-height: 90dvh;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Heading/styles.module.css/#css-module-data */
._Heading_97eh4_1 {
  display: block;
  color: var(--_puck-heading-color, var(--puck-color-text));
  font-weight: var(--puck-font-weight-bold);
  margin: 0;
}
._Heading_97eh4_1 b {
  font-weight: var(--puck-font-weight-bold);
}
._Heading--xxxxl_97eh4_12 {
  font-size: var(--puck-font-size-xxxxl);
  letter-spacing: var(--puck-letter-spacing-heading);
  font-weight: var(--puck-font-weight-heavy);
}
._Heading--xxxl_97eh4_18 {
  font-size: var(--puck-font-size-xxxl);
}
._Heading--xxl_97eh4_22 {
  font-size: var(--puck-font-size-xxl);
}
._Heading--xl_97eh4_26 {
  font-size: var(--puck-font-size-xl);
}
._Heading--l_97eh4_30 {
  font-size: var(--puck-font-size-l);
}
._Heading--m_97eh4_34 {
  font-size: var(--puck-font-size-m);
}
._Heading--s_97eh4_38 {
  font-size: var(--puck-font-size-s);
}
._Heading--xs_97eh4_42 {
  font-size: var(--puck-font-size-xs);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Button/Button.module.css/#css-module-data */
._Button_oe4qj_1 {
  --_puck-button-default-space-x: 20px;
  --_puck-button-default-font-size: var(--puck-font-size-xxs);
  --_puck-button-default-font-weight: var(--puck-font-weight-regular);
  --_puck-button-default-color-bg-disabled: var(--puck-color-bg-disabled);
  --_puck-button-default-color-text-disabled: var(--puck-color-text-disabled);
  appearance: none;
  background: none;
  border: var(--puck-border-width-regular) solid transparent;
  border-radius: var(--puck-button-radius, var(--puck-radius-m));
  color: var(--puck-color-text-inverse);
  display: inline-flex;
  align-items: center;
  gap: var(--puck-space-2);
  letter-spacing: var(--puck-letter-spacing-ui);
  font-family: var(--puck-font-family);
  box-sizing: border-box;
  line-height: 1;
  text-align: center;
  text-decoration: none;
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit), color var(--puck-duration-fast) var(--puck-ease-exit);
  cursor: pointer;
  white-space: nowrap;
  margin: 0;
}
._Button_oe4qj_1:hover,
._Button_oe4qj_1:active {
  transition: none;
}
._Button--medium_oe4qj_34 {
  min-height: 34px;
  padding-bottom: var( --puck-button-medium-space-y, calc(var(--puck-space-2) - var(--puck-border-width-regular)) );
  padding-inline-start: var( --puck-button-medium-space-x, calc(var(--_puck-button-default-space-x) - var(--puck-border-width-regular)) );
  padding-inline-end: var( --puck-button-medium-space-x, calc(var(--_puck-button-default-space-x) - var(--puck-border-width-regular)) );
  padding-top: var( --puck-button-medium-space-y, calc(var(--puck-space-2) - var(--puck-border-width-regular)) );
  font-weight: var( --puck-button-medium-font-weight, var(--_puck-button-default-font-weight) );
  font-size: var( --puck-button-medium-font-size, var(--_puck-button-default-font-size) );
}
._Button--large_oe4qj_62 {
  padding-bottom: var( --puck-button-large-space-y, calc(var(--puck-space-3) - var(--puck-border-width-regular)) );
  padding-inline-start: var( --puck-button-large-space-x, calc(var(--_puck-button-default-space-x) - var(--puck-border-width-regular)) );
  padding-inline-end: var( --puck-button-large-space-x, calc(var(--_puck-button-default-space-x) - var(--puck-border-width-regular)) );
  padding-top: var( --puck-button-large-space-y, calc(var(--puck-space-3) - var(--puck-border-width-regular)) );
  font-weight: var( --puck-button-large-font-weight, var(--_puck-button-default-font-weight) );
  font-size: var( --puck-button-large-font-size, var(--_puck-button-default-font-size) );
}
._Button-icon_oe4qj_89 {
  margin-top: 2px;
}
._Button--primary_oe4qj_93 {
  background: var( --puck-button-primary-color-bg, var(--puck-color-interactive) );
  border-color: var(--puck-button-primary-color-border, transparent);
  color: var(--puck-button-primary-color-text, var(--puck-color-text-inverse));
}
._Button_oe4qj_1:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
}
@media (hover: hover) and (pointer: fine) {
  ._Button--primary_oe4qj_93:hover {
    background-color: var( --puck-button-primary-color-bg-hover, var(--puck-color-interactive-hover) );
  }
}
._Button--primary_oe4qj_93:active {
  background-color: var( --puck-button-primary-color-bg-active, var(--puck-color-interactive-active) );
}
._Button--primary_oe4qj_93._Button--disabled_oe4qj_123,
._Button--primary_oe4qj_93._Button--disabled_oe4qj_123:hover {
  background-color: var( --puck-button-primary-color-bg-disabled, var(--_puck-button-default-color-bg-disabled) );
  color: var( --puck-button-primary-color-text-disabled, var(--_puck-button-default-color-text-disabled) );
}
._Button--secondary_oe4qj_135 {
  background: var(--puck-button-secondary-color-bg, transparent);
  border-color: var(--puck-button-secondary-color-border, currentColor);
  color: var(--puck-button-secondary-color-text, currentColor);
}
@media (hover: hover) and (pointer: fine) {
  ._Button--secondary_oe4qj_135:hover {
    background-color: var( --puck-button-secondary-color-bg-hover, var(--puck-color-interactive-soft) );
    color: var(--puck-button-secondary-color-text, var(--puck-color-text));
  }
}
._Button--secondary_oe4qj_135:active {
  background-color: var( --puck-button-secondary-color-bg-active, var(--puck-color-interactive-soft) );
  color: var(--puck-button-secondary-color-text, var(--puck-color-text));
}
._Button--secondary_oe4qj_135._Button--disabled_oe4qj_123,
._Button--secondary_oe4qj_135._Button--disabled_oe4qj_123:hover {
  background-color: var( --puck-button-secondary-color-bg-disabled, var(--_puck-button-default-color-bg-disabled) );
  color: var( --puck-button-secondary-color-text-disabled, var(--_puck-button-default-color-text-disabled) );
}
._Button--flush_oe4qj_171 {
  border-radius: var(--puck-radius-none);
}
._Button--disabled_oe4qj_123:hover {
  cursor: not-allowed;
}
._Button--fullWidth_oe4qj_179 {
  justify-content: center;
  width: 100%;
}
._Button-spinner_oe4qj_184 {
  padding-inline-start: var(--puck-space-2);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/RichTextMenu/styles.module.css/#css-module-data */
._RichTextMenu_1ve2j_1 {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
}
._RichTextMenu--form_1ve2j_7 {
  border-top-left-radius: var(--puck-field-radius, var(--puck-radius-m));
  border-top-right-radius: var(--puck-field-radius, var(--puck-radius-m));
  padding: var(--puck-field-richtext-menu-space-y, 6px) var(--puck-field-richtext-menu-space-x, 6px);
  background-color: var( --puck-field-richtext-menu-color-bg, var(--puck-color-surface-subtle) );
  position: relative;
  scrollbar-width: none;
  overflow-x: auto;
}
._RichTextMenu-group_1ve2j_21 {
  display: flex;
  align-items: space-between;
  flex-direction: row;
  flex-wrap: nowrap;
  padding-inline: 6px;
  gap: 2px;
  position: relative;
}
._RichTextMenu-group_1ve2j_21:first-of-type {
  padding-left: 0;
}
._RichTextMenu-group_1ve2j_21:last-of-type {
  padding-right: 0;
}
._RichTextMenu--inline_1ve2j_39 ._RichTextMenu-group_1ve2j_21 {
  color: var(--puck-color-text-inverse);
  gap: 0px;
  flex-wrap: nowrap;
}
._RichTextMenu-group_1ve2j_21 + ._RichTextMenu-group_1ve2j_21 {
  border-left: var(--puck-border-width-regular) solid var( --puck-field-richtext-menu-color-separator, var(--puck-color-border-muted) );
}
._RichTextMenu--inline_1ve2j_39 ._RichTextMenu-group_1ve2j_21 + ._RichTextMenu-group_1ve2j_21 {
  border-left: var(--puck-border-width-hairline) solid var(--puck-color-border-inverse);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/RichTextMenu/components/Control/styles.module.css/#css-module-data */
._Control_id4pm_1 .lucide {
  height: var(--puck-icon-size-m);
  width: var(--puck-icon-size-m);
}
._Control--inline_id4pm_6 .lucide {
  height: var(--puck-actionbar-action-size, var(--puck-icon-size-s));
  width: var(--puck-actionbar-action-size, var(--puck-icon-size-s));
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Select/styles.module.css/#css-module-data */
._Select_1n4iv_1 {
  position: relative;
  z-index: 1;
}
._Select-buttonInner_1n4iv_6 {
  align-items: center;
  display: flex;
}
._Select-buttonIcon_1n4iv_11 {
  align-items: center;
  display: flex;
  justify-content: center;
}
._Select--standalone_1n4iv_17 ._Select-buttonIcon_1n4iv_11 .lucide {
  height: var(--puck-icon-size-m);
  width: var(--puck-icon-size-m);
}
._Select--actionBar_1n4iv_22 ._Select-buttonIcon_1n4iv_11 .lucide {
  height: var(--puck-actionbar-action-size, var(--puck-icon-size-s));
  width: var(--puck-actionbar-action-size, var(--puck-icon-size-s));
}
._Select-items_1n4iv_27 {
  background: var(--puck-color-surface);
  border: var(--puck-border-width-regular) solid var(--puck-color-border);
  border-radius: var(--puck-radius-l);
  margin: 10px 8px;
  margin-left: 0;
  padding: var(--puck-space-1);
  z-index: 2;
  list-style: none;
}
._SelectItem_1n4iv_38 {
  background: transparent;
  border-radius: var(--puck-radius-m);
  border: none;
  color: var(--puck-color-text-secondary);
  cursor: pointer;
  display: flex;
  gap: var(--puck-space-2);
  align-items: center;
  font-size: var(--puck-font-size-xxs);
  margin: 0;
  padding: var(--puck-space-2) var(--puck-space-3);
  width: 100%;
}
._SelectItem--isSelected_1n4iv_53 {
  background: var(--puck-color-interactive-soft);
  color: var(--puck-color-interactive);
  font-weight: var(--puck-font-weight-medium);
}
._SelectItem--isSelected_1n4iv_53 ._SelectItem-icon_1n4iv_59 {
  color: var(--puck-color-interactive);
}
._SelectItem_1n4iv_38:hover {
  background: var(--puck-color-interactive-soft);
  color: var(--puck-color-interactive);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/RichTextEditor/styles.module.css/#css-module-data */
._RichTextEditor_5wzos_1 .ProseMirror {
  white-space: pre-wrap;
  word-wrap: break-word;
  cursor: text;
  outline: none;
  position: relative;
}
._RichTextEditor_5wzos_1 .rich-text * {
  white-space: pre-wrap;
  user-select: auto;
  -webkit-user-select: auto;
}
._RichTextEditor_5wzos_1 .rich-text blockquote {
  margin: 1em 0;
  padding: 0 1em;
  border-left: var(--puck-border-width-strong) solid var(--puck-color-border);
}
._RichTextEditor_5wzos_1 .rich-text code {
  background-color: var(--puck-color-surface-muted);
  padding: var(--puck-space-1) var(--puck-space-2);
  border-radius: var(--puck-radius-m);
}
._RichTextEditor_5wzos_1 .rich-text p:empty::before {
  content: "\\a0";
}
._RichTextEditor_5wzos_1 .rich-text pre code {
  display: block;
  padding: var(--puck-space-2) var(--puck-space-3);
}
._RichTextEditor_5wzos_1 .rich-text > *:first-child,
._RichTextEditor_5wzos_1 .ProseMirror > *:first-child,
._RichTextEditor_5wzos_1 .rich-text * p:first-of-type {
  margin-top: 0;
}
._RichTextEditor_5wzos_1 .rich-text > *:last-child,
._RichTextEditor_5wzos_1 .ProseMirror > *:last-child,
._RichTextEditor_5wzos_1 .rich-text * p:last-of-type {
  margin-bottom: 0;
}
._RichTextEditor--editor_5wzos_50 {
  color: var(--puck-field-color-text, var(--puck-color-text));
  background: var(--puck-field-color-bg, var(--puck-color-surface));
  border-width: var( --puck-field-border-width, var(--puck-border-width-regular) );
  border-style: solid;
  border-color: var(--puck-field-color-border, var(--puck-color-border));
  border-radius: var(--puck-field-radius, var(--puck-radius-m));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  font-family: inherit;
  font-size: var(--puck-field-font-size, var(--puck-font-size-xxs));
  resize: vertical;
  text-align: initial;
  transition: border-color var(--puck-duration-fast) var(--puck-ease-exit);
  width: 100%;
  max-width: 100%;
  min-height: 128px;
}
._RichTextEditor--editor_5wzos_50 .rich-text {
  flex-grow: 1;
}
._RichTextEditor--editor_5wzos_50 .rich-text:not(:has(.ProseMirror)),
._RichTextEditor--editor_5wzos_50 .rich-text .ProseMirror {
  height: 100%;
  padding: var(--puck-field-space-y, var(--puck-space-3)) var( --puck-field-space-x, calc( var(--puck-space-4) - var(--puck-field-border-width, var(--puck-border-width-regular)) ) );
}
._RichTextEditor--editor_5wzos_50 .rich-text ul,
._RichTextEditor--editor_5wzos_50 .rich-text ol {
  padding-left: var(--puck-space-5);
}
._RichTextEditor--editor_5wzos_50 .rich-text li {
  line-height: 1.5;
}
._RichTextEditor--editor_5wzos_50 .rich-text p {
  margin-block: var(--puck-space-3);
}
._RichTextEditor--editor_5wzos_50 .rich-text ul {
  list-style: disc;
}
._RichTextEditor--editor_5wzos_50 .rich-text ol {
  list-style: decimal;
}
._RichTextEditor--editor_5wzos_50:focus-within {
  border-color: var( --puck-field-color-border-hover, var(--puck-color-border-hover) );
  outline: var(--puck-border-width-focus) solid var(--puck-field-color-border-focus, var(--puck-color-focus-ring));
  transition: none;
}
@media (hover: hover) and (pointer: fine) {
  ._RichTextEditor--editor_5wzos_50:hover:not(._RichTextEditor--disabled_5wzos_123) {
    border-color: var( --puck-field-color-border-hover, var(--puck-color-border-hover) );
    transition: none;
  }
}
._RichTextEditor--editor_5wzos_50._RichTextEditor--disabled_5wzos_123 {
  background: var( --puck-field-color-bg-disabled, var(--puck-color-surface-muted) );
  border-color: var( --puck-field-color-border-disabled, var(--puck-color-border) );
}
._RichTextEditor--editor_5wzos_50._RichTextEditor--disabled_5wzos_123 .rich-text:not(:has(.ProseMirror)),
._RichTextEditor--editor_5wzos_50._RichTextEditor--disabled_5wzos_123 .rich-text .ProseMirror {
  color: var( --puck-field-color-text-disabled, var(--puck-color-text-secondary) );
}
._RichTextEditor--editor_5wzos_50._RichTextEditor--disabled_5wzos_123 .ProseMirror[contenteditable=false] {
  cursor: default;
}
._RichTextEditor_5wzos_1:not(:focus-within):not(._RichTextEditor--isActive_5wzos_159) .ProseMirror ::selection {
  background-color: transparent;
}
._RichTextEditor-menu_5wzos_165 {
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border-muted);
  position: sticky;
  top: 0;
  z-index: 1;
}
._RichTextEditor--disabled_5wzos_123 ._RichTextEditor-menu_5wzos_165 {
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/AutoField/fields/ObjectField/styles.module.css/#css-module-data */
._ObjectField_c5reb_1 {
  display: flex;
  flex-direction: column;
  background-color: var(--puck-field-color-surface, var(--puck-color-surface));
  border: var(--puck-field-border-width, var(--puck-border-width-regular)) solid var(--puck-field-color-border, var(--puck-color-border));
  border-radius: var(--puck-field-radius, var(--puck-radius-m));
}
._ObjectField-fieldset_c5reb_10 {
  border: none;
  margin: 0;
  min-width: 0;
  padding: var(--puck-field-space-surface-y, var(--puck-space-4)) var( --puck-field-space-surface-x, calc( var(--puck-space-4) - var(--puck-field-border-width, var(--puck-border-width-regular)) ) );
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Drawer/styles.module.css/#css-module-data */
._Drawer_1n90m_1 {
  display: flex;
  flex-direction: column;
  font-family: var(--puck-font-family);
  gap: var(--puck-space-3);
}
._Drawer-draggable_1n90m_8 {
  position: relative;
}
._Drawer-draggableBg_1n90m_12 {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  z-index: -1;
}
._DrawerItem-draggable_1n90m_22 {
  background: var(--puck-drawer-item-color-bg, var(--puck-color-surface));
  color: var(--puck-drawer-item-color-text, var(--puck-color-text));
  cursor: grab;
  padding: var(--puck-drawer-item-space, var(--puck-space-3));
  display: flex;
  border: var(--puck-drawer-item-border-width, var(--puck-border-width-regular)) var(--puck-drawer-item-color-border, var(--puck-color-border)) solid;
  border-radius: var(--puck-drawer-item-radius, var(--puck-radius-m));
  font-size: var(--puck-drawer-item-font-size, var(--puck-font-size-xxs));
  justify-content: space-between;
  align-items: center;
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit), color var(--puck-duration-fast) var(--puck-ease-exit);
}
._DrawerItem--disabled_1n90m_38 ._DrawerItem-draggable_1n90m_22 {
  background: var(--puck-color-surface-muted);
  color: var(--puck-color-text-muted);
  cursor: not-allowed;
}
._DrawerItem_1n90m_22:focus-visible {
  outline: 0;
}
._Drawer_1n90m_1:not(._Drawer--isDraggingFrom_1n90m_48) ._DrawerItem_1n90m_22:focus-visible ._DrawerItem-draggable_1n90m_22 {
  border-radius: var(--puck-radius-m);
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
}
@media (hover: hover) and (pointer: fine) {
  ._Drawer_1n90m_1:not(._Drawer--isDraggingFrom_1n90m_48) ._DrawerItem_1n90m_22:not(._DrawerItem--disabled_1n90m_38) ._DrawerItem-draggable_1n90m_22:hover {
    background-color: var( --puck-drawer-item-color-bg-hover, var(--puck-color-interactive-soft-hover) );
    color: var( --puck-drawer-item-color-text-hover, var(--puck-color-interactive) );
    transition: none;
  }
}
._DrawerItem-name_1n90m_72 {
  overflow-x: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/DraggableComponent/styles.module.css/#css-module-data */
._DraggableComponent_1627v_1 {
  position: absolute;
  pointer-events: none;
}
._DraggableComponent-overlayWrapper_1627v_6 {
  height: 100%;
  width: 100%;
  top: 0;
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
  z-index: 1;
}
._DraggableComponent-overlay_1627v_6 {
  cursor: pointer;
  height: 100%;
  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var( --puck-slot-component-color-overlay-border, var(--puck-color-selection-border) ) solid;
  outline-offset: calc(var(--puck-slot-component-border-width, var(--puck-border-width-focus)) * -1);
  width: 100%;
}
._DraggableComponent_1627v_1:focus-visible > ._DraggableComponent-overlayWrapper_1627v_6 {
  outline: var(--puck-border-width-regular) solid var(--puck-color-focus-ring);
}
._DraggableComponent-loadingOverlay_1627v_38 {
  background: var(--puck-color-surface);
  color: var(--puck-color-text);
  border-radius: var(--puck-radius-m);
  display: flex;
  padding: var(--puck-space-2);
  top: var(--puck-space-2);
  right: var(--puck-space-2);
  position: absolute;
  z-index: 1;
  pointer-events: all;
  box-sizing: border-box;
  opacity: 0.8;
  z-index: 1;
}
._DraggableComponent--hover_1627v_54 > ._DraggableComponent-overlayWrapper_1627v_6 > ._DraggableComponent-overlay_1627v_6 {
  background: var( --puck-slot-component-color-overlay, var(--puck-color-selection-bg) );
  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var( --puck-slot-component-color-overlay-border, var(--puck-color-selection-border) ) solid;
}
._DraggableComponent--isSelected_1627v_72 > ._DraggableComponent-overlayWrapper_1627v_6 > ._DraggableComponent-overlay_1627v_6 {
  outline-color: var( --puck-slot-component-color-border-selected, var(--puck-color-selection-border) );
}
._DraggableComponent_1627v_1:has(._DraggableComponent--hover_1627v_54 > ._DraggableComponent-overlayWrapper_1627v_6) > ._DraggableComponent-overlayWrapper_1627v_6 {
  display: none;
}
._DraggableComponent-actionsOverlay_1627v_89 {
  position: sticky;
  opacity: 0;
  pointer-events: none;
  z-index: 2;
}
._DraggableComponent--isSelected_1627v_72 ._DraggableComponent-actionsOverlay_1627v_89 {
  opacity: 1;
  pointer-events: auto;
}
._DraggableComponent-actions_1627v_89 {
  position: absolute;
  width: auto;
  cursor: grab;
  display: flex;
  box-sizing: border-box;
  transform-origin: right top;
  min-height: 36px;
}
._DraggableComponent-actionsAction_1627v_111 {
  height: var(--puck-actionbar-action-size, var(--puck-icon-size-s));
  width: var(--puck-actionbar-action-size, var(--puck-icon-size-s));
}

/* components/DraggableComponent/styles.css */
[data-puck-component] * {
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}
[data-puck-component] {
  cursor: grab;
  pointer-events: auto !important;
  user-select: none;
  -webkit-user-select: none;
}
[data-puck-dropzone] {
  pointer-events: auto !important;
}
[data-puck-disabled] {
  cursor: pointer;
}
[data-dnd-placeholder]:not([data-puck-line-drag] *) {
  background: var( --puck-slot-component-color-placeholder, var(--puck-color-azure-06) ) !important;
  border: none !important;
  color: transparent !important;
  opacity: 0.3 !important;
  outline: none !important;
  transition: none !important;
}
[data-dnd-placeholder]:not([data-puck-line-drag] *) *,
[data-dnd-placeholder]:not([data-puck-line-drag] *)::after,
[data-dnd-placeholder]:not([data-puck-line-drag] *)::before {
  opacity: 0 !important;
}
[data-puck-line-drag] [data-dnd-placeholder] {
  opacity: 0.4 !important;
  outline: none !important;
  transition: none !important;
}
[data-puck-line-drag] [data-dnd-dragging][data-puck-component] {
  opacity: 0.9 !important;
}
[data-dnd-dragging][data-puck-component] {
  pointer-events: none !important;
  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var(--puck-slot-component-color-border-dragging, var(--puck-color-azure-09)) solid !important;
  outline-offset: calc(var(--puck-slot-component-border-width, var(--puck-border-width-focus)) * -1) !important;
}
[data-dnd-dragging][data-puck-component] > :first-child {
  margin-top: 0 !important;
}
[data-dnd-dragging][data-puck-component] > :last-child {
  margin-bottom: 0 !important;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/DropZone/styles.module.css/#css-module-data */
._DropZone_wc2ks_1 {
  position: relative;
  height: 100%;
  min-height: var(--puck-slot-min-empty-height);
  outline-offset: calc(var(--puck-slot-border-width, var(--puck-border-width-focus)) * -1);
  width: 100%;
}
._DropZone--hasChildren_wc2ks_11 {
  min-height: 0;
}
._DropZone_wc2ks_1:empty {
  min-height: var(--puck-slot-min-empty-height);
}
[data-puck-entry]:not([data-puck-dragging]) ._DropZone_wc2ks_1 {
  transition: min-height var(--puck-duration-medium) var(--puck-ease-exit);
}
._DropZone--isAreaSelected_wc2ks_24,
._DropZone--hoveringOverArea_wc2ks_25:not(._DropZone--isRootZone_wc2ks_25) {
  background: var(--puck-slot-color-bg, var(--puck-color-selection-bg));
  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));
}
._DropZone_wc2ks_1:empty {
  background: var(--puck-slot-color-bg, var(--puck-color-selection-bg));
  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));
}
._DropZone-item_wc2ks_39 {
  position: relative;
}
._DropZone-linePlaceholder_wc2ks_43 {
  background: var( --puck-slot-component-color-placeholder, var(--puck-color-line-placeholder) );
  border-radius: calc(var(--puck-line-placeholder-width, 2px) / 2);
  pointer-events: none;
  position: absolute;
  z-index: 1;
}
._DropZone-hitbox_wc2ks_55 {
  position: absolute;
  bottom: calc(var(--puck-space-3) * -1);
  height: var(--puck-space-5);
  width: 100%;
  z-index: 1;
}
[data-puck-dragging] ._DropZone--isEnabled_wc2ks_63 {
  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));
}
._DropZone_wc2ks_1 > *:not([data-puck-component]):not([data-puck-line-placeholder]) {
  opacity: 0;
}
body:has(._DropZone--isAnimating_wc2ks_74:empty) [data-puck-overlay] {
  opacity: 0 !important;
}

/* lib/overlay-portal/styles.css */
[data-puck-overlay-portal],
[data-puck-overlay-portal] * {
  pointer-events: auto !important;
}
[data-puck-entry][data-puck-dragging] [data-puck-overlay-portal],
[data-puck-entry][data-puck-dragging] [data-puck-overlay-portal] * {
  pointer-events: none !important;
}
[data-puck-entry][data-puck-preview-mode=edit] [data-puck-overlay-portal]:hover {
  outline: 2px var(--puck-color-azure-09, #cfdff0) dashed;
  outline-offset: 2px;
}
[data-puck-entry][data-puck-preview-mode=edit] [data-puck-overlay-portal]:focus-within {
  outline: 2px var(--puck-color-azure-07, #88b0da) dashed;
  outline-offset: 2px;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/InlineTextField/styles.module.css/#css-module-data */
._InlineTextField_104qp_1 {
  cursor: text;
  display: inline-block;
  white-space: pre-wrap;
  text-decoration: inherit;
}
[data-dnd-dragging] ._InlineTextField_104qp_1 {
  cursor: none;
  caret-color: transparent;
}
[data-dnd-dragging] ._InlineTextField_104qp_1::selection {
  display: none;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Fields/styles.module.css/#css-module-data */
._PuckFields_wnj25_1 {
  position: relative;
  font-family: var(--puck-font-family);
}
._PuckFields--isLoading_wnj25_6 {
  min-height: 48px;
}
._PuckFields-loadingOverlay_wnj25_10 {
  background: var(--puck-color-surface);
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  height: 100%;
  width: 100%;
  top: 0px;
  position: absolute;
  z-index: 1;
  pointer-events: all;
  box-sizing: border-box;
  opacity: 0.8;
}
._PuckFields-loadingOverlayInner_wnj25_25 {
  display: flex;
  padding: var(--puck-space-4);
  position: sticky;
  top: 0;
}
._PuckFields-field_wnj25_32 * {
  box-sizing: border-box;
}
._PuckFields--wrapFields_wnj25_36 ._PuckFields-field_wnj25_32 {
  color: var(--puck-color-text-secondary);
  padding: var(--puck-space-4);
  padding-bottom: var(--puck-space-3);
  display: block;
}
._PuckFields--wrapFields_wnj25_36 ._PuckFields-field_wnj25_32 + ._PuckFields-field_wnj25_32 {
  border-top: var(--puck-border-width-regular) solid var(--puck-color-border);
  margin-top: var(--puck-space-2);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/ComponentList/styles.module.css/#css-module-data */
._ComponentList_htktj_1 {
  max-width: 100%;
}
._ComponentList--isExpanded_htktj_5 + ._ComponentList_htktj_1 {
  margin-top: var(--puck-space-3);
}
._ComponentList-content_htktj_9 {
  display: none;
}
._ComponentList--isExpanded_htktj_5 > ._ComponentList-content_htktj_9 {
  display: block;
}
._ComponentList-title_htktj_17 {
  background-color: transparent;
  border: 0;
  color: var(--puck-drawer-category-color-text, var(--puck-color-text-muted));
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: var(--puck-drawer-category-font-size, var(--puck-font-size-xxxs));
  list-style: none;
  margin-bottom: 6px;
  padding: var(--puck-drawer-category-space, var(--puck-space-2));
  text-transform: uppercase;
  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit), color var(--puck-duration-fast) var(--puck-ease-exit);
  gap: var(--puck-space-1);
  border-radius: var(--puck-radius-m);
  width: 100%;
}
._ComponentList-title_htktj_17:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
}
@media (hover: hover) and (pointer: fine) {
  ._ComponentList-title_htktj_17:hover {
    background-color: var( --puck-drawer-category-color-bg-hover, var(--puck-color-interactive-soft) );
    color: var( --puck-drawer-category-color-text-hover, var(--puck-color-interactive) );
    transition: none;
  }
}
._ComponentList-title_htktj_17:active {
  background-color: var( --puck-drawer-category-color-bg-active, var(--puck-color-interactive-subtle) );
  transition: none;
}
._ComponentList-titleIcon_htktj_63 {
  margin-inline-start: auto;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Preview/styles.module.css/#css-module-data */
._PuckPreview_zbic3_1 {
  position: relative;
  height: 100%;
}
._PuckPreview-frame_zbic3_6 {
  border: none;
  height: 100%;
  width: 100%;
}
._PuckPreview-frame_zbic3_6[data-puck-outline-dragging] {
  pointer-events: none;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/LayerTree/components/drop-line/styles.module.css/#css-module-data */
._DropLine_eyz3q_2 {
  background: var(--_puck-outline-color-drop-indicator);
  border-radius: calc(var(--_puck-outline-drop-indicator-size) / 2);
  height: var(--_puck-outline-drop-indicator-size);
  inset-inline: 0;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}
._DropLine--top_eyz3q_12 {
  top: 0;
}
._DropLine--bottom_eyz3q_16 {
  bottom: 0;
}
._DropLine--top_eyz3q_12._DropLine--outset_eyz3q_20 {
  top: calc(-1 * var(--_puck-outline-drop-indicator-size));
}
._DropLine--bottom_eyz3q_16._DropLine--outset_eyz3q_20 {
  bottom: calc(-1 * var(--_puck-outline-drop-indicator-size));
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/LayerTree/components/empty-zone-placeholder/styles.module.css/#css-module-data */
._LayerTree-helper_1m7e4_2 {
  color: var(--puck-outline-color-text-helper, var(--puck-color-text-subtle));
  padding-top: var(--puck-space-1);
  padding-bottom: var(--puck-space-1);
  padding-inline-start: var(--_puck-outline-label-indent);
  border: var(--_puck-outline-border-width) solid transparent;
}
._LayerTree-helperRoot_1m7e4_11 {
  padding-inline-start: var(--puck-space-3);
}
._LayerTree-helper_1m7e4_2[data-puck-drop-target] {
  position: relative;
  overflow: visible;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/LayerTree/components/layer/styles.module.css/#css-module-data */
._Layer_onfgu_1 {
  position: relative;
  border: var(--_puck-outline-border-width) solid transparent;
  border-radius: var(--_puck-outline-radius);
}
._Layer-inner_onfgu_8 {
  align-items: center;
  border: var(--_puck-outline-border-width) solid transparent;
  border-radius: var(--_puck-outline-radius);
  cursor: pointer;
  display: flex;
  position: relative;
  transition: color var(--puck-duration-fast) var(--puck-ease-exit);
}
._Layer--isSortable_onfgu_18 > ._Layer-inner_onfgu_8 {
  cursor: grab;
}
._Layer-content_onfgu_22 {
  display: flex;
  gap: var(--puck-space-4);
  flex: 1 1 auto;
  min-width: 0;
}
._Layer-clickable_onfgu_29 {
  align-items: center;
  background: none;
  border: 0;
  border-radius: var(--_puck-outline-radius);
  color: inherit;
  cursor: inherit;
  display: flex;
  flex: 1 1 auto;
  font: inherit;
  min-width: 0;
  padding: 0;
}
[data-puck-dnd-disabled] ._Layer-inner_onfgu_8,
[data-puck-dnd-disabled] ._Layer-clickable_onfgu_29 {
  cursor: pointer;
}
._Layer-clickable_onfgu_29:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
  position: relative;
  z-index: 1;
}
._Layer-caret_onfgu_57 {
  visibility: hidden;
  display: flex;
  flex-shrink: 0;
}
._Layer-caret_onfgu_57 svg {
  height: var(--_puck-outline-caret-size);
  width: var(--_puck-outline-caret-size);
}
._Layer--containsZone_onfgu_68 > ._Layer-inner_onfgu_8 > ._Layer-content_onfgu_22 {
  font-weight: var(--puck-font-weight-bold);
}
._Layer--containsZone_onfgu_68 > ._Layer-inner_onfgu_8 > ._Layer-caret_onfgu_57 {
  visibility: visible;
}
._Layer-title_onfgu_76 {
  display: flex;
  gap: var(--puck-space-2);
  align-items: center;
  overflow-x: hidden;
  margin: var(--puck-space-1);
  cursor: pointer;
}
._Layer-name_onfgu_85 {
  overflow-x: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
._Layer-icon_onfgu_91 {
  color: var(--puck-outline-color-icon, var(--puck-color-text-subtle));
  margin-top: var(--puck-space-1);
}
._Layer-icon_onfgu_91 svg {
  height: var(--_puck-outline-icon-size);
  width: var(--_puck-outline-icon-size);
}
._Layer-zones_onfgu_101 {
  display: none;
  margin-inline-start: var(--puck-outline-space-indent, var(--puck-space-4));
}
._Layer--isExpanded_onfgu_106 > ._Layer-zones_onfgu_101 {
  display: block;
}
._Layer--isExpanded_onfgu_106 > ._Layer-inner_onfgu_8 > ._Layer-caret_onfgu_57 svg {
  transform: rotate(90deg);
}
@media (hover: hover) and (pointer: fine) {
  ._Layer_onfgu_1:not(._Layer--isSelected_onfgu_115) > ._Layer-inner_onfgu_8:hover {
    --_puck-outline-actions-color-bg: var(--_puck-outline-color-bg-hover);
    border-color: var(--_puck-outline-color-border-hover);
    background: var(--_puck-outline-color-bg-hover);
    transition: none;
  }
}
._Layer--isSelected_onfgu_115 > ._Layer-inner_onfgu_8 {
  border-color: var( --puck-outline-color-border-selected, var(--puck-color-selection-border) );
}
._Layer--isSelected_onfgu_115 > ._Layer-inner_onfgu_8 {
  --_puck-outline-actions-color-bg: var(--_puck-outline-color-bg-selected);
  background: var(--_puck-outline-color-bg-selected);
}
._Layer--isExpandCandidate_onfgu_138 > ._Layer-inner_onfgu_8 {
  border-color: var(--_puck-outline-color-border-hover);
  background: var(--_puck-outline-color-bg-hover);
}
._Layer--isDragSource_onfgu_143 > ._Layer-inner_onfgu_8 {
  color: var(--puck-color-text-muted);
  background: transparent;
}
._Layer--isDragSource_onfgu_143 > ._Layer-zones_onfgu_101 {
  opacity: 0.5;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/LayerTree/components/layer-actions/styles.module.css/#css-module-data */
._LayerActions_d90t9_2 {
  position: sticky;
  inset-inline-end: calc(var(--puck-space-1) * -1);
  padding-inline: var(--puck-space-1);
  display: flex;
  visibility: hidden;
  flex-shrink: 0;
  color: var(--_puck-outline-color-text);
  background: var(--_puck-outline-actions-color-bg);
  border-top-right-radius: var(--_puck-outline-radius);
  border-bottom-right-radius: var(--_puck-outline-radius);
}
._LayerActions--visible_d90t9_18 {
  visibility: visible;
}
._LayerActions_d90t9_2 svg {
  height: var(--_puck-outline-caret-size);
  width: var(--_puck-outline-caret-size);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/LayerTree/components/layer-tree-items/styles.module.css/#css-module-data */
._LayerTree_o5tyt_1 {
  color: var(--_puck-outline-color-text);
  font-family: var(--puck-outline-font-family, var(--puck-font-family));
  font-size: var(--puck-outline-font-size, var(--puck-font-size-xxxs));
  margin: 0;
  position: relative;
  list-style: none;
  padding: 0;
}
._LayerTree--nested_o5tyt_12 {
  margin-inline-start: var(--puck-outline-space-indent, var(--puck-space-3));
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/LayerTree/components/layer-tree-zone/styles.module.css/#css-module-data */
._LayerTree-zoneTitle_fvhlh_2 {
  color: var(--_puck-outline-zone-color-text);
  font-size: var( --puck-outline-zone-font-size, calc(var(--puck-font-size-xxxs) * 0.9) );
  display: flex;
  gap: var(--puck-space-2);
  align-items: center;
  overflow-x: hidden;
  padding-top: var(--puck-space-1);
  padding-bottom: var(--puck-space-1);
  padding-inline-start: var(--_puck-outline-label-indent);
  border: var(--_puck-outline-border-width) solid transparent;
}
._LayerTree-zoneIcon_fvhlh_19 {
  margin-top: var(--puck-space-1);
}
._LayerTree-zoneIcon_fvhlh_19 svg {
  height: var(--_puck-outline-icon-size);
  width: var(--_puck-outline-icon-size);
}
._LayerTree-zoneTitle_fvhlh_2[data-puck-drop-target] {
  color: var(--_puck-outline-color-text-hover);
  position: relative;
  overflow: visible;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/LayerTree/styles.module.css/#css-module-data */
._LayerTreeRoot_1qowl_1 {
  min-width: max-content;
  --_puck-iconbutton-color-bg-hover: transparent;
  --_puck-outline-color-text: var( --puck-outline-color-text, var(--puck-color-text-primary) );
  --_puck-outline-border-width: var( --puck-outline-border-width, var(--puck-border-width-regular) );
  --_puck-outline-radius: var(--puck-outline-radius, var(--puck-radius-m));
  --_puck-outline-caret-size: var( --puck-outline-action-size, var(--puck-icon-size-s) );
  --_puck-outline-icon-size: var( --puck-outline-icon-size, var(--puck-icon-size-xs) );
  --_puck-outline-color-bg-selected: var( --puck-outline-color-bg-selected, var(--puck-color-interactive-subtle) );
  --_puck-outline-color-bg-hover: var( --puck-outline-color-bg-hover, var(--puck-color-interactive-soft) );
  --_puck-outline-color-border-hover: var( --puck-outline-color-border-hover, var(--puck-color-interactive-subtle) );
  --_puck-outline-color-text-hover: var( --puck-outline-color-text-hover, var(--puck-color-interactive) );
  --_puck-outline-color-drop-indicator: var( --puck-outline-color-drop-indicator, var(--puck-color-line-placeholder) );
  --_puck-outline-drop-indicator-size: var(--puck-line-placeholder-width);
  --_puck-outline-zone-color-text: var( --puck-outline-zone-color-text, var(--puck-color-text-muted) );
  --_puck-outline-actions-color-bg: transparent;
  --_puck-outline-caret-slot: calc( var(--_puck-outline-caret-size) + var(--puck-iconbutton-space, var(--puck-space-1)) * 2 );
  --_puck-outline-label-indent: calc( var(--_puck-outline-caret-slot) + var(--puck-space-2) + var(--_puck-outline-border-width) );
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Outline/components/collapse-all/styles.module.css/#css-module-data */
._CollapseAll_1r4cy_1 {
  visibility: hidden;
}
._CollapseAll-icon_1r4cy_5 {
  height: var(--puck-icon-size-m);
  width: var(--puck-icon-size-m);
}
._CollapseAll--visible_1r4cy_10 {
  visibility: visible;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Outline/components/outline-header/styles.module.css/#css-module-data */
._OutlineHeader_ntv8r_1 {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--puck-space-2);
  padding-block: var(--puck-space-3);
  padding-inline: var(--puck-space-4);
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
  box-sizing: border-box;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Outline/styles.module.css/#css-module-data */
._OutlineWrapper_b9ln0_1 {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
  min-width: 0;
}
._OutlineWrapper-collapseAll_b9ln0_9 {
  display: flex;
  align-items: center;
  margin-inline-start: auto;
}
._OutlineWrapper-layers_b9ln0_15 {
  flex-grow: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--puck-space-1);
  box-sizing: border-box;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Layout/styles.module.css/#css-module-data */
._Puck_tzaxg_19 {
  font-family: var(--puck-font-family);
  overflow-x: hidden;
  visibility: visible !important;
}
@media (min-width: 766px) {
  ._Puck_tzaxg_19 {
    overflow-x: auto;
  }
}
._Puck-portal_tzaxg_31 {
  position: relative;
  z-index: 2;
}
._PuckLayout_tzaxg_36 {
  height: 100dvh;
}
._PuckLayout-inner_tzaxg_40 {
  --puck-frame-width: auto;
  --puck-pluginbar-width: min-content;
  --puck-sidebar-width: 0px;
  --puck-sidebar-left-width: var( --puck-user-sidebar-left-width, var(--puck-sidebar-width) );
  --puck-sidebar-right-width: var( --puck-user-sidebar-right-width, var(--puck-sidebar-width) );
  background-color: var(--puck-color-surface-subtle);
  display: grid;
  grid-template-areas: "header" "editor" "left" "right" "sidenav";
  grid-template-columns: var(--puck-frame-width);
  grid-template-rows: min-content auto 0 0 var(--puck-pluginbar-width);
  height: 100%;
  position: relative;
  transition: grid-template-rows var(--puck-duration-medium) var(--puck-ease-exit);
  z-index: 0;
  overflow: hidden;
}
@media (min-width: 638px) {
  ._PuckLayout-inner_tzaxg_40 {
    --puck-pluginbar-width: 68px;
    grid-template-areas: "header header header header" "sidenav left editor right";
    grid-template-columns: var(--puck-pluginbar-width) 0 var(--puck-frame-width) 0;
    grid-template-rows: min-content auto;
  }
  ._Puck--hidePlugins_tzaxg_73 ._PuckLayout-inner_tzaxg_40 {
    --puck-pluginbar-width: 0;
  }
}
._PuckLayout--mounted_tzaxg_78 ._PuckLayout-inner_tzaxg_40 {
  --puck-sidebar-width: 186px;
}
._PuckLayout--mobilePanelHeightToggle_tzaxg_82._PuckLayout--leftSideBarVisible_tzaxg_82 ._PuckLayout-inner_tzaxg_40 {
  grid-template-rows: 0 auto 30% 0 var(--puck-pluginbar-width);
  transition: grid-template-rows var(--puck-duration-medium) var(--puck-ease-entrance);
}
._PuckLayout--mobilePanelHeightToggle_tzaxg_82._PuckLayout--leftSideBarVisible_tzaxg_82._PuckLayout--isExpanded_tzaxg_90 ._PuckLayout-inner_tzaxg_40 {
  grid-template-rows: 0 auto 55% 0 var(--puck-pluginbar-width);
  transition: grid-template-rows var(--puck-duration-medium) var(--puck-ease-entrance);
}
@media (min-width: 638px) {
  ._PuckLayout--mobilePanelHeightToggle_tzaxg_82._PuckLayout--leftSideBarVisible_tzaxg_82 ._PuckLayout-inner_tzaxg_40 {
    grid-template-columns: var(--puck-pluginbar-width) var(--puck-sidebar-left-width) var( --puck-frame-width ) 0;
    grid-template-rows: min-content auto;
  }
}
._PuckLayout--mobilePanelHeightMinContent_tzaxg_110._PuckLayout--leftSideBarVisible_tzaxg_82 ._PuckLayout-inner_tzaxg_40,
._PuckLayout--mobilePanelHeightMinContent_tzaxg_110._PuckLayout--leftSideBarVisible_tzaxg_82._PuckLayout--isExpanded_tzaxg_90 ._PuckLayout-inner_tzaxg_40 {
  grid-template-rows: 0 auto min-content 0 var(--puck-pluginbar-width);
}
@media (min-width: 638px) {
  ._PuckLayout--mobilePanelHeightToggle_tzaxg_82._PuckLayout--leftSideBarVisible_tzaxg_82 ._PuckLayout-inner_tzaxg_40,
  ._PuckLayout--mobilePanelHeightToggle_tzaxg_82._PuckLayout--leftSideBarVisible_tzaxg_82._PuckLayout--isExpanded_tzaxg_90 ._PuckLayout-inner_tzaxg_40,
  ._PuckLayout--mobilePanelHeightMinContent_tzaxg_110._PuckLayout--leftSideBarVisible_tzaxg_82 ._PuckLayout-inner_tzaxg_40,
  ._PuckLayout--mobilePanelHeightMinContent_tzaxg_110._PuckLayout--leftSideBarVisible_tzaxg_82._PuckLayout--isExpanded_tzaxg_90 ._PuckLayout-inner_tzaxg_40 {
    grid-template-columns: var(--puck-pluginbar-width) var(--puck-sidebar-left-width) var( --puck-frame-width ) 0;
    grid-template-rows: min-content auto;
  }
}
@media (min-width: 638px) {
  ._PuckLayout--rightSideBarVisible_tzaxg_137 ._PuckLayout-inner_tzaxg_40 {
    grid-template-columns: var(--puck-pluginbar-width) 0 var(--puck-frame-width) var(--puck-sidebar-right-width);
  }
}
@media (min-width: 638px) {
  ._PuckLayout--leftSideBarVisible_tzaxg_82._PuckLayout--rightSideBarVisible_tzaxg_137 ._PuckLayout-inner_tzaxg_40 {
    grid-template-columns: var(--puck-pluginbar-width) var(--puck-sidebar-left-width) var( --puck-frame-width ) var(--puck-sidebar-right-width);
  }
}
@media (min-width: 458px) {
  ._PuckLayout-mounted_tzaxg_156 ._PuckLayout-inner_tzaxg_40 {
    --puck-frame-width: minmax(266px, auto);
  }
}
@media (min-width: 638px) {
  ._PuckLayout_tzaxg_36 ._PuckLayout-inner_tzaxg_40 {
    --puck-sidebar-width: minmax(186px, 250px);
  }
}
@media (min-width: 766px) {
  ._PuckLayout_tzaxg_36 ._PuckLayout-inner_tzaxg_40 {
    --puck-frame-width: auto;
  }
}
@media (min-width: 990px) {
  ._PuckLayout_tzaxg_36 ._PuckLayout-inner_tzaxg_40 {
    --puck-sidebar-width: 256px;
  }
}
@media (min-width: 1198px) {
  ._PuckLayout_tzaxg_36 ._PuckLayout-inner_tzaxg_40 {
    --puck-sidebar-width: 274px;
  }
}
@media (min-width: 1398px) {
  ._PuckLayout_tzaxg_36 ._PuckLayout-inner_tzaxg_40 {
    --puck-sidebar-width: 290px;
  }
}
@media (min-width: 1598px) {
  ._PuckLayout_tzaxg_36 ._PuckLayout-inner_tzaxg_40 {
    --puck-sidebar-width: 320px;
  }
}
._PuckLayout-nav_tzaxg_197 {
  border-top: var(--puck-border-width-regular) solid var(--puck-color-border);
  background-color: var( --puck-pluginbar-color-bg, var(--puck-color-surface-subtle) );
  grid-area: sidenav;
  overflow: hidden;
  width: 100%;
}
@media (min-width: 638px) {
  ._PuckLayout-nav_tzaxg_197 {
    border-top: 0;
    border-right: var(--puck-border-width-regular) solid var(--puck-color-border);
    box-sizing: border-box;
  }
}
._PuckLayout-header_tzaxg_217 {
  grid-area: header;
}
._PuckLayout--leftSideBarVisible_tzaxg_82 ._PuckLayout-header_tzaxg_217 {
  overflow: hidden;
}
@media (min-width: 638px) {
  ._PuckLayout--leftSideBarVisible_tzaxg_82 ._PuckLayout-header_tzaxg_217 {
    overflow: auto;
  }
}
._PuckPluginTab_tzaxg_231 {
  display: none;
  flex-grow: 1;
  max-height: 100%;
}
._PuckPluginTab--visible_tzaxg_237 {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
._PuckPluginTab-body_tzaxg_243 {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  max-height: 100%;
  min-height: 0;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/MenuBar/styles.module.css/#css-module-data */
._MenuBar_1hxnj_1 {
  background-color: var(--_puck-menu-bar-color-bg, var(--puck-color-surface));
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
  display: none;
  left: 0;
  margin-top: 1px;
  padding: var(--puck-space-2) var(--puck-space-4);
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 2;
}
._MenuBar--menuOpen_1hxnj_14 {
  display: block;
}
@media (min-width: 638px) {
  ._MenuBar_1hxnj_1 {
    border: none;
    display: block;
    margin-top: 0;
    overflow-y: visible;
    padding: 0;
    position: static;
  }
}
._MenuBar-inner_1hxnj_29 {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--puck-space-2) var(--puck-space-4);
  justify-content: flex-end;
}
@media (min-width: 638px) {
  ._MenuBar-inner_1hxnj_29 {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
  }
}
._MenuBar-history_1hxnj_45 {
  display: flex;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Header/styles.module.css/#css-module-data */
._PuckHeader_c2nei_1 {
  --_puck-menu-bar-color-bg: var( --puck-header-color-bg, var(--puck-color-surface) );
  background: var(--puck-header-color-bg, var(--puck-color-surface));
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
  color: var(--puck-header-color-text, var(--puck-color-text));
  --_puck-heading-color: var(--puck-header-color-text, var(--puck-color-text));
  grid-area: header;
  position: relative;
  max-width: 100vw;
}
@media (min-width: 638px) {
  ._PuckHeader_c2nei_1 {
    padding-left: 67px;
  }
  ._PuckHeader--hidePlugins_c2nei_21 {
    padding-left: 0;
  }
}
._PuckHeader-inner_c2nei_26 {
  align-items: end;
  display: grid;
  gap: var(--puck-space-chrome-gutter);
  grid-template-areas: "left middle right";
  grid-template-columns: 1fr auto 1fr;
  grid-template-rows: auto;
  padding: var(--puck-space-chrome-gutter);
}
@media (min-width: 638px) {
  ._PuckHeader-inner_c2nei_26 {
    border-left: var(--puck-border-width-regular) solid var(--puck-color-border);
  }
  ._PuckHeader--hidePlugins_c2nei_21 ._PuckHeader-inner_c2nei_26 {
    border-left: none;
  }
}
._PuckHeader-toggle_c2nei_46 {
  display: flex;
  margin-inline-start: calc(var(--puck-space-1) * -1);
  padding-top: 2px;
}
._PuckHeader-rightSideBarToggle_c2nei_52,
._PuckHeader-leftSideBarToggle_c2nei_53 {
  display: none;
}
@media (min-width: 638px) {
  ._PuckHeader-rightSideBarToggle_c2nei_52,
  ._PuckHeader-leftSideBarToggle_c2nei_53 {
    display: block;
  }
}
._PuckHeader-title_c2nei_64 {
  align-self: center;
}
._PuckHeader-path_c2nei_68 {
  font-family: var(--puck-font-family-monospaced);
  font-size: var(--puck-font-size-xxs);
  font-weight: normal;
  word-break: break-all;
}
._PuckHeader-tools_c2nei_75 {
  display: flex;
  gap: var(--puck-space-4);
  justify-content: flex-end;
}
._PuckHeader-menuButton_c2nei_81 {
  color: var(--puck-color-text-muted);
  margin-inline-start: calc(var(--puck-space-1) * -1);
}
._PuckHeader--menuOpen_c2nei_86 ._PuckHeader-menuButton_c2nei_81 {
  color: var(--puck-color-text);
}
@media (min-width: 638px) {
  ._PuckHeader-menuButton_c2nei_81 {
    display: none;
  }
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/SidebarSection/styles.module.css/#css-module-data */
._SidebarSection_1uv88_1 {
  display: flex;
  position: relative;
  flex-direction: column;
  color: var(--puck-color-text);
}
._SidebarSection_1uv88_1:last-of-type {
  flex-grow: 1;
}
._SidebarSection-title_1uv88_12 {
  background: var(--_puck-sidebar-section-color-bg, var(--puck-color-surface));
  padding: var(--puck-space-4);
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
  border-top: var(--puck-border-width-regular) solid var(--puck-color-border);
  overflow-x: auto;
}
._SidebarSection--noBorderTop_1uv88_20 > ._SidebarSection-title_1uv88_12 {
  border-top: 0px;
}
._SidebarSection-content_1uv88_24:last-child {
  padding-bottom: var(--puck-space-1);
}
._SidebarSection_1uv88_1:last-of-type ._SidebarSection-content_1uv88_24 {
  border-bottom: none;
  flex-grow: 1;
}
._SidebarSection-breadcrumbLabel_1uv88_33 {
  background: none;
  border: 0;
  border-radius: var(--puck-radius-xs);
  color: var(--puck-color-interactive);
  cursor: pointer;
  font: inherit;
  flex-shrink: 0;
  padding: 0;
  transition: color var(--puck-duration-fast) var(--puck-ease-exit);
}
._SidebarSection-breadcrumbLabel_1uv88_33:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
}
@media (hover: hover) and (pointer: fine) {
  ._SidebarSection-breadcrumbLabel_1uv88_33:hover {
    color: var(--puck-color-interactive-hover);
    transition: none;
  }
}
._SidebarSection-breadcrumbLabel_1uv88_33:active {
  color: var(--puck-color-interactive-active);
  transition: none;
}
._SidebarSection-breadcrumbs_1uv88_62 {
  align-items: center;
  display: flex;
  gap: var(--puck-space-1);
}
._SidebarSection-breadcrumb_1uv88_33 {
  align-items: center;
  display: flex;
  gap: var(--puck-space-1);
}
._SidebarSection-heading_1uv88_74 {
  padding-inline-end: var(--puck-space-4);
}
._SidebarSection-loadingOverlay_1uv88_78 {
  background: var(--puck-color-surface);
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  top: 0;
  position: absolute;
  z-index: 1;
  pointer-events: all;
  box-sizing: border-box;
  opacity: 0.8;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Breadcrumbs/styles.module.css/#css-module-data */
._Breadcrumbs_8c6w5_1 {
  align-items: center;
  display: flex;
  gap: var(--puck-space-1);
}
._Breadcrumbs-breadcrumbLabel_8c6w5_7 {
  background: none;
  border: 0;
  border-radius: var(--puck-radius-xs);
  color: var(--puck-color-interactive);
  cursor: pointer;
  font: inherit;
  flex-shrink: 0;
  padding: 0;
  transition: color var(--puck-duration-fast) var(--puck-ease-exit);
}
._Breadcrumbs-breadcrumbLabel_8c6w5_7:focus-visible {
  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);
  outline-offset: var(--puck-border-width-focus);
}
@media (hover: hover) and (pointer: fine) {
  ._Breadcrumbs-breadcrumbLabel_8c6w5_7:hover {
    color: var(--puck-color-interactive-hover);
    transition: none;
  }
}
._Breadcrumbs-breadcrumbLabel_8c6w5_7:active {
  color: var(--puck-color-interactive-active);
  transition: none;
}
._Breadcrumbs-breadcrumb_8c6w5_7 {
  align-items: center;
  display: flex;
  gap: var(--puck-space-1);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/ViewportControls/styles.module.css/#css-module-data */
._ViewportControls_v26yb_1 {
  position: relative;
}
._ViewportControls--fullScreen_v26yb_5 {
  border-radius: 32px;
  display: flex;
  position: absolute;
  bottom: var(--puck-space-3);
  right: var(--puck-space-3);
  overflow: hidden;
}
._ViewportControls-toggleButton_v26yb_14 {
  display: none;
}
._ViewportControls--fullScreen_v26yb_5 ._ViewportControls-toggleButton_v26yb_14 {
  align-items: center;
  background-color: var(--puck-color-surface-inverse);
  border: var(--puck-border-width-regular) solid var(--puck-color-border-inverse);
  border-radius: var(--puck-radius-pill);
  cursor: pointer;
  color: var(--puck-color-text-inverse);
  display: flex;
  justify-content: center;
  width: 42px;
  height: 42px;
  z-index: 1;
}
._ViewportControls--fullScreen_v26yb_5 ._ViewportControls-toggleButton_v26yb_14:hover {
  color: var(--puck-color-interactive-inverse-hover);
  border: var(--puck-border-width-regular) solid var(--puck-color-interactive-inverse-hover);
}
._ViewportControls-actions_v26yb_39 {
  display: flex;
}
._ViewportControls-actionsInner_v26yb_43 {
  display: flex;
  box-sizing: border-box;
  justify-content: center;
  margin-left: auto;
  margin-right: auto;
  z-index: 0;
  overflow: hidden;
}
._ViewportControls--fullScreen_v26yb_5 ._ViewportControls-actionsInner_v26yb_43 {
  background: var(--puck-color-surface-muted);
  border: var(--puck-border-width-regular) solid var(--puck-color-border);
  border-radius: var(--puck-radius-pill);
  margin-left: none;
  margin-right: none;
  padding-right: 42px;
}
._ViewportControls--fullScreen_v26yb_5 ._ViewportControls-actionsInner_v26yb_43 {
  transform: translateX(100%);
  transition: transform var(--puck-duration-medium) var(--puck-ease-emphasized);
}
._ViewportControls--fullScreen_v26yb_5._ViewportControls--isExpanded_v26yb_67 ._ViewportControls-actionsInner_v26yb_43 {
  transform: translateX(42px);
}
._ViewportControls-divider_v26yb_72 {
  border-inline-end: var(--puck-border-width-regular) solid var(--puck-color-border);
  margin-bottom: var(--puck-space-2);
  margin-top: var(--puck-space-2);
}
._ViewportControls-zoomSelect_v26yb_79 {
  appearance: none;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23c3c3c3'><polygon points='0,0 100,0 50,50'/></svg>") no-repeat;
  background-size: 10px;
  color: currentColor;
  background-position: calc(100% - 12px) calc(50% + 3px);
  background-repeat: no-repeat;
  border: 0;
  font-size: var(--puck-font-size-xxxs);
  padding: 0;
  padding-left: var(--puck-space-2);
  width: 96px;
}
._ViewportControls--fullScreen_v26yb_5 ._ViewportControls-zoom_v26yb_79 {
  display: none;
}
@media (min-width: 638px) {
  ._ViewportControls-zoom_v26yb_79,
  ._ViewportControls--fullScreen_v26yb_5 ._ViewportControls-zoom_v26yb_79 {
    display: flex;
    justify-content: center;
  }
}
._ViewportControls-zoomSelect_v26yb_79:dir(rtl) {
  background-position: 12px calc(50% + 3px);
}
._ViewportButton-inner_v26yb_110 {
  align-items: center;
  display: flex;
  justify-content: center;
  height: 32px;
  width: 32px;
}
._ViewportButton--isActive_v26yb_118 ._ViewportButton-inner_v26yb_110 {
  color: var(--puck-color-interactive);
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Canvas/styles.module.css/#css-module-data */
._PuckCanvas_zw9iy_1 {
  color: var(--puck-canvas-color-text, var(--puck-color-text));
  background: var(--puck-canvas-color-bg, var(--puck-color-surface-muted));
  display: flex;
  grid-area: editor;
  flex-direction: column;
  padding: var(--puck-space-chrome-gutter);
  position: relative;
  overflow: auto;
}
@media (min-width: 1198px) {
  ._PuckCanvas_zw9iy_1 {
    padding: calc(var(--puck-space-chrome-gutter) * 1.5);
    padding-top: calc(var(--puck-space-chrome-gutter) * 0.5);
  }
  ._PuckCanvas_zw9iy_1:not(._PuckCanvas_zw9iy_1:has(._PuckCanvas-controls_zw9iy_18)) {
    padding-top: calc(var(--puck-space-chrome-gutter) * 1.5);
  }
}
._PuckCanvas--fullScreen_zw9iy_23 {
  padding: 0;
  overflow: hidden;
}
@media (min-width: 1198px) {
  ._PuckCanvas--fullScreen_zw9iy_23 {
    padding: 0;
  }
}
._PuckCanvas-inner_zw9iy_34 {
  display: flex;
  height: 100%;
  justify-content: center;
  min-width: 288px;
  position: relative;
  width: 100%;
}
._PuckCanvas-root_zw9iy_43 {
  background: var(--puck-canvas-preview-color-bg, var(--puck-color-surface));
  outline: var(--puck-border-width-regular) solid var(--puck-color-border);
  box-sizing: content-box;
  min-width: 321px;
  position: absolute;
  pointer-events: none;
  transform-origin: top;
  top: 0;
  bottom: 0;
  opacity: 0;
}
@media (min-width: 1198px) {
  ._PuckCanvas-root_zw9iy_43 {
    min-width: unset;
  }
}
@media (prefers-reduced-motion: reduce) {
  ._PuckCanvas-root_zw9iy_43 {
    transition: none !important;
  }
}
._PuckCanvas--ready_zw9iy_68 ._PuckCanvas-root_zw9iy_43 {
  pointer-events: unset;
  opacity: 1;
}
._PuckCanvas-loader_zw9iy_73 {
  align-items: center;
  color: var(--puck-color-text-subtle);
  display: flex;
  height: 100%;
  justify-content: center;
  transition: opacity var(--puck-duration-slow) var(--puck-ease-entrance);
  opacity: 0;
  pointer-events: none;
}
._PuckCanvas--showLoader_zw9iy_84 ._PuckCanvas-loader_zw9iy_73 {
  opacity: 1;
}
._PuckCanvas--showLoader_zw9iy_84._PuckCanvas--ready_zw9iy_68 ._PuckCanvas-loader_zw9iy_73 {
  opacity: 0;
  height: 0;
  transition: none;
}
._PuckCanvas-controls_zw9iy_18 {
  padding-bottom: calc(var(--puck-space-chrome-gutter) * 0.5);
}
._PuckCanvas--fullScreen_zw9iy_23 ._PuckCanvas-controls_zw9iy_18 {
  padding-bottom: 0;
  z-index: 1;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/ResizeHandle/styles.module.css/#css-module-data */
@media (min-width: 766px) {
  ._ResizeHandle_144bf_2 {
    position: absolute;
    width: 5px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
    background: transparent;
    top: 0;
  }
  ._ResizeHandle_144bf_2:hover {
    background: rgba(0, 0, 0, 0.1);
  }
  ._ResizeHandle--left_144bf_16 {
    right: -3px;
  }
  ._ResizeHandle--right_144bf_20 {
    left: -3px;
  }
}

/* components/Puck/components/ResizeHandle/styles.css */
[data-resize-overlay] {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  cursor: col-resize;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Sidebar/styles.module.css/#css-module-data */
._Sidebar_16oed_1 {
  border-block-start: var(--puck-border-width-regular) solid var(--puck-color-border);
  position: relative;
  display: none;
  flex-direction: column;
  overflow-y: auto;
}
._Sidebar--isVisible_16oed_10 {
  display: flex;
}
._Sidebar--left_16oed_14 {
  --_puck-sidebar-section-color-bg: var( --puck-sidebar-left-color-bg, var(--puck-color-surface) );
  background: var( --puck-sidebar-left-color-bg, var(--puck-color-surface-subtle) );
  grid-area: left;
}
@media (min-width: 766px) {
  ._Sidebar--left_16oed_14 {
    border-block-start: 0;
    border-inline-end: var(--puck-border-width-regular) solid var(--puck-color-border);
  }
}
._Sidebar--right_16oed_34 {
  --_puck-sidebar-section-color-bg: var( --puck-sidebar-right-color-bg, var(--puck-color-surface) );
  background: var(--puck-sidebar-right-color-bg, var(--puck-color-surface));
  grid-area: right;
}
@media (min-width: 766px) {
  ._Sidebar--right_16oed_34 {
    border-block-start: 0;
    border-inline-start: var(--puck-border-width-regular) solid var(--puck-color-border);
  }
}
._Sidebar-resizeHandle_16oed_51 {
  position: absolute;
  height: 100%;
}
._Sidebar--left_16oed_14 + ._Sidebar-resizeHandle_16oed_51 {
  grid-area: left;
  justify-self: end;
}
._Sidebar--right_16oed_34 + ._Sidebar-resizeHandle_16oed_51 {
  grid-area: right;
  justify-self: start;
}

/* css-module:/home/runner/work/puck/puck/packages/core/components/Puck/components/Nav/styles.module.css/#css-module-data */
._Nav_vll2r_1 {
  display: flex;
}
._Nav-list_vll2r_5 {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-x: auto;
  gap: var(--puck-space-2);
}
@media (min-width: 638px) {
  ._Nav-list_vll2r_5 {
    padding-top: 32px;
    flex-direction: column;
    gap: var(--puck-space-4);
    width: 100%;
  }
}
._Nav-mobileActions_vll2r_23 {
  align-items: center;
  display: flex;
  justify-content: center;
  margin-inline-start: auto;
  padding: var(--puck-space-1) var(--puck-space-4);
  border-inline-start: var(--puck-border-width-regular) solid var(--puck-color-border);
}
@media (min-width: 638px) {
  ._Nav-mobileActions_vll2r_23 {
    display: none;
  }
}
._NavItem-link_vll2r_39 {
  text-align: center;
  align-items: center;
  color: var(--puck-pluginbar-color-text, var(--puck-color-text-secondary));
  display: flex;
  gap: var(--puck-space-2);
  text-decoration: none;
  cursor: pointer;
  border-radius: var(--puck-radius-m);
  padding: var(--puck-space-2) var(--puck-space-1);
  width: 64px;
  box-sizing: border-box;
}
@media (min-width: 638px) {
  ._NavItem-link_vll2r_39 {
    width: auto;
  }
}
._NavItem_vll2r_39:first-of-type {
  padding-left: var(--puck-space-4);
}
._NavItem_vll2r_39:last-of-type {
  padding-right: var(--puck-space-4);
}
@media (min-width: 638px) {
  ._NavItem_vll2r_39:first-of-type,
  ._NavItem_vll2r_39:last-of-type {
    padding: 0;
  }
}
._NavItem-link_vll2r_39 {
  border-top: var(--puck-border-width-strong) solid transparent;
  border-bottom: var(--puck-border-width-strong) solid transparent;
  border-radius: var(--puck-radius-none);
  flex-direction: column;
  font-size: var(--puck-pluginbar-font-size, var(--puck-font-size-xxxs));
}
@media (min-width: 638px) {
  ._NavItem-link_vll2r_39 {
    border: 0;
    border-left: var(--puck-border-width-strong) solid transparent;
    border-right: var(--puck-border-width-strong) solid transparent;
  }
}
._NavItem-linkIcon_vll2r_90 {
  height: 2em;
  width: 2em;
}
._NavItem-linkIcon_vll2r_90 svg {
  height: 100%;
  width: 100%;
}
._NavItem--active_vll2r_100 > ._NavItem-link_vll2r_39 {
  background-color: var(--puck-color-interactive-subtle);
  color: var( --puck-pluginbar-color-text-selected, var(--puck-color-interactive) );
  font-weight: var(--puck-font-weight-semibold);
}
._NavItem--active_vll2r_100 > ._NavItem-link_vll2r_39 {
  background-color: transparent;
  border-top-color: var(--puck-color-interactive);
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  font-weight: var(--puck-font-weight-semibold);
}
@media (min-width: 638px) {
  ._NavItem--active_vll2r_100 > ._NavItem-link_vll2r_39 {
    border-top-color: transparent;
    border-right-color: var( --puck-pluginbar-color-text-selected, var(--puck-color-interactive) );
  }
}
._NavItem_vll2r_39:not(._NavItem--active_vll2r_100) > ._NavItem-link_vll2r_39:hover {
  background-color: var( --puck-pluginbar-color-bg-hover, var(--puck-color-interactive-soft) );
  color: var(--puck-pluginbar-color-text-hover, var(--puck-color-interactive));
}
@media (min-width: 638px) {
  ._NavItem--mobileOnly_vll2r_136 {
    display: none;
  }
}
._NavItem--desktopOnly_vll2r_141 {
  display: none;
}
@media (min-width: 638px) {
  ._NavItem--desktopOnly_vll2r_141 {
    display: block;
  }
}

/* css-module:/home/runner/work/puck/puck/packages/core/plugins/blocks/styles.module.css/#css-module-data */
._BlocksPlugin_9af19_1 {
  padding: var(--puck-drawer-space, var(--puck-space-4));
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

/* css-module:/home/runner/work/puck/puck/packages/core/plugins/outline/styles.module.css/#css-module-data */
._OutlinePlugin_1ylsc_1 {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
}

/* css-module:/home/runner/work/puck/puck/packages/core/plugins/fields/styles.module.css/#css-module-data */
._FieldsPlugin_18cj3_1 {
  background: var(--puck-color-surface);
  height: 100%;
  overflow-y: auto;
}
._FieldsPlugin-header_18cj3_7 {
  border-bottom: var(--puck-border-width-regular) solid var(--puck-color-border);
  font-weight: var(--puck-font-weight-semibold);
  padding-bottom: var(--puck-space-2);
  padding-left: var(--puck-space-4);
  padding-right: var(--puck-space-4);
  padding-top: var(--puck-space-2);
}
@media (min-width: 638px) {
  ._FieldsPlugin-header_18cj3_7 {
    padding: var(--puck-space-4);
  }
}`,mm="data-puck-style-source",mn="puck",mo=new WeakMap,mp=(a,b,c=!1)=>{let d=a.head;if(d){if(b.parentElement!==d)return void(c?d.prepend(b):d.append(b));c&&d.firstChild!==b&&d.prepend(b),c||d.lastChild===b||d.append(b)}},mq=a=>(null==a?void 0:a.getAttribute(mm))===mn,mr=a=>{var b;let c=(b=null==a?void 0:a.document)?b:"u">typeof document?document:void 0;(0,cv.useInsertionEffect)(()=>{if(!a||!c)return;let b=(a=>{let b=mo.get(a);if(b)return b;let c=new Map;return mo.set(a,c),c})(c),d=b.get(a.id);if(d)d.count=d.count+1,d.el.textContent!==a.cssText&&(d.el.textContent=a.cssText),mp(c,d.el,a.prepend);else{let d=((a,b,c,d=!1)=>{let e=a.createElement("style");return e.setAttribute(mm,mn),e.setAttribute("data-puck-style-id",b),e.textContent=c,mp(a,e,d),e})(c,a.id,a.cssText,a.prepend);b.set(a.id,{count:1,el:d})}return()=>{let c=b.get(a.id);c&&(c.count=c.count-1,c.count<=0&&(c.el.remove(),b.delete(a.id)))}},[null==a?void 0:a.cssText,null==a?void 0:a.id,null==a?void 0:a.prepend,null==a?void 0:a.document,c])},ms=null,mt='style, link[rel="stylesheet"]',mu="data-puck-style-mirror",mv=a=>!(!a.matches(mt)||mq(a))&&("STYLE"!==a.tagName||!!a.innerHTML.trim()),mw=a=>Array.from(document.styleSheets).find(b=>b.ownerNode.href===a.href),mx=(a,b)=>{let c=a.attributes;(null==c?void 0:c.length)>0&&Array.from(c).forEach(a=>{b.setAttribute(a.name,a.value)})},my=({children:a,debug:b=!1,onStylesLoaded:c=()=>null,syncHostStyles:d=!0})=>{let{document:e,window:f}=mA();return mr(e?{cssText:'/* styles/color.css */\n@layer puck-tokens {\n  :root {\n    --puck-color-rose-01: #4a001c;\n    --puck-color-rose-02: #670833;\n    --puck-color-rose-03: #87114c;\n    --puck-color-rose-04: #a81a66;\n    --puck-color-rose-05: #bc5089;\n    --puck-color-rose-06: #cc7ca5;\n    --puck-color-rose-07: #d89aba;\n    --puck-color-rose-08: #e3b8cf;\n    --puck-color-rose-09: #efd6e3;\n    --puck-color-rose-10: #f6eaf1;\n    --puck-color-rose-11: #faf4f8;\n    --puck-color-rose-12: #fef8fc;\n    --puck-color-azure-01: #00175d;\n    --puck-color-azure-02: #002c77;\n    --puck-color-azure-03: #014292;\n    --puck-color-azure-04: #0158ad;\n    --puck-color-azure-05: #3479be;\n    --puck-color-azure-06: #6499cf;\n    --puck-color-azure-07: #88b0da;\n    --puck-color-azure-08: #abc7e5;\n    --puck-color-azure-09: #cfdff0;\n    --puck-color-azure-10: #e7eef7;\n    --puck-color-azure-11: #f3f6fb;\n    --puck-color-azure-12: #f7faff;\n    --puck-color-green-01: #002000;\n    --puck-color-green-02: #043604;\n    --puck-color-green-03: #084e08;\n    --puck-color-green-04: #0c680c;\n    --puck-color-green-05: #1d882f;\n    --puck-color-green-06: #2faa53;\n    --puck-color-green-07: #56c16f;\n    --puck-color-green-08: #7dd78b;\n    --puck-color-green-09: #b8e8bf;\n    --puck-color-green-10: #ddf3e0;\n    --puck-color-green-11: #eff8f0;\n    --puck-color-green-12: #f3fcf4;\n    --puck-color-yellow-01: #211000;\n    --puck-color-yellow-02: #362700;\n    --puck-color-yellow-03: #4c4000;\n    --puck-color-yellow-04: #645a00;\n    --puck-color-yellow-05: #877614;\n    --puck-color-yellow-06: #ab9429;\n    --puck-color-yellow-07: #bfac4e;\n    --puck-color-yellow-08: #d4c474;\n    --puck-color-yellow-09: #e6deb1;\n    --puck-color-yellow-10: #f3efd9;\n    --puck-color-yellow-11: #f9f7ed;\n    --puck-color-yellow-12: #fcfaf0;\n    --puck-color-red-01: #4c0000;\n    --puck-color-red-02: #6a0a10;\n    --puck-color-red-03: #8a1422;\n    --puck-color-red-04: #ac1f35;\n    --puck-color-red-05: #bf5366;\n    --puck-color-red-06: #ce7e8e;\n    --puck-color-red-07: #d99ca8;\n    --puck-color-red-08: #e4b9c2;\n    --puck-color-red-09: #efd7db;\n    --puck-color-red-10: #f6eaec;\n    --puck-color-red-11: #faf4f5;\n    --puck-color-red-12: #fff9fa;\n    --puck-color-grey-01: #181818;\n    --puck-color-grey-02: #292929;\n    --puck-color-grey-03: #404040;\n    --puck-color-grey-04: #5a5a5a;\n    --puck-color-grey-05: #767676;\n    --puck-color-grey-06: #949494;\n    --puck-color-grey-07: #ababab;\n    --puck-color-grey-08: #c3c3c3;\n    --puck-color-grey-09: #dcdcdc;\n    --puck-color-grey-10: #efefef;\n    --puck-color-grey-11: #f5f5f5;\n    --puck-color-grey-12: #fafafa;\n    --puck-color-black: #000000;\n    --puck-color-white: #ffffff;\n  }\n}\n\n/* styles/tokens.css */\n@layer puck-tokens {\n  :root {\n    --puck-color-surface: var(--puck-color-white);\n    --puck-color-surface-muted: var(--puck-color-grey-11);\n    --puck-color-surface-subtle: var(--puck-color-grey-12);\n    --puck-color-surface-inverse: var(--puck-color-grey-01);\n    --puck-color-border: var(--puck-color-grey-09);\n    --puck-color-border-hover: var(--puck-color-grey-05);\n    --puck-color-border-muted: var(--puck-color-grey-10);\n    --puck-color-border-inverse: var(--puck-color-grey-05);\n    --puck-color-text: var(--puck-color-black);\n    --puck-color-text-secondary: var(--puck-color-grey-04);\n    --puck-color-text-muted: var(--puck-color-grey-05);\n    --puck-color-text-subtle: var(--puck-color-grey-07);\n    --puck-color-text-inverse: var(--puck-color-white);\n    --puck-opacity-text-inverse: 0.75;\n    --puck-color-interactive: var(--puck-color-azure-04);\n    --puck-color-interactive-hover: var(--puck-color-azure-03);\n    --puck-color-interactive-active: var(--puck-color-azure-02);\n    --puck-color-interactive-subtle: var(--puck-color-azure-10);\n    --puck-color-interactive-soft: var(--puck-color-azure-11);\n    --puck-color-interactive-soft-hover: var(--puck-color-azure-12);\n    --puck-color-interactive-neutral-hover: var(--puck-color-grey-10);\n    --puck-color-interactive-inverse-hover: var(--puck-color-azure-06);\n    --puck-color-interactive-inverse-active: var(--puck-color-azure-07);\n    --puck-color-focus-ring: var(--puck-color-azure-05);\n    --puck-color-selection-bg: color-mix( in srgb, var(--puck-color-azure-09) 30%, transparent );\n    --puck-color-selection-border: var(--puck-color-azure-08);\n    --puck-color-line-placeholder: var(--puck-color-azure-06);\n    --puck-color-highlight: var(--puck-color-rose-07);\n    --puck-color-bg-disabled: var(--puck-color-grey-07);\n    --puck-color-text-disabled: var(--puck-color-grey-03);\n    --puck-color-overlay-backdrop: color-mix( in srgb, var(--puck-color-black) 75%, transparent );\n    --puck-space-1: 4px;\n    --puck-space-2: 8px;\n    --puck-space-3: 12px;\n    --puck-space-4: 16px;\n    --puck-space-5: 24px;\n    --puck-space-chrome-gutter: var(--puck-space-4);\n    --puck-radius-none: 0;\n    --puck-radius-xs: 2px;\n    --puck-radius-s: 3px;\n    --puck-radius-m: 4px;\n    --puck-radius-l: 8px;\n    --puck-radius-pill: 30px;\n    --puck-radius-round: 100%;\n    --puck-border-width-hairline: 0.5px;\n    --puck-border-width-regular: 1px;\n    --puck-border-width-focus: 2px;\n    --puck-border-width-strong: 4px;\n    --puck-duration-fast: 50ms;\n    --puck-duration-medium: 150ms;\n    --puck-duration-slow: 250ms;\n    --puck-ease-exit: ease-in;\n    --puck-ease-emphasized: ease-in-out;\n    --puck-ease-entrance: ease-out;\n    --puck-font-weight-regular: 400;\n    --puck-font-weight-medium: 500;\n    --puck-font-weight-semibold: 600;\n    --puck-font-weight-bold: 700;\n    --puck-font-weight-heavy: 800;\n    --puck-letter-spacing-ui: 0.05ch;\n    --puck-letter-spacing-heading: 0.08ch;\n    --puck-icon-size-xs: 14px;\n    --puck-icon-size-s: 16px;\n    --puck-icon-size-m: 18px;\n    --puck-icon-size-l: 24px;\n    --puck-space-m-unitless: 24;\n    --puck-user-sidebar-left-width: var(--puck-sidebar-width);\n    --puck-user-sidebar-right-width: var(--puck-sidebar-width);\n    --puck-slot-min-empty-height: 128px;\n    --puck-line-placeholder-width: 2px;\n  }\n}\n\n/* styles/typography.css */\n@layer puck-tokens {\n  :root {\n    --puck-font-size-scale-base-unitless: 12;\n    --puck-font-size-xxxs-unitless: 12;\n    --puck-font-size-xxs-unitless: 14;\n    --puck-font-size-xs-unitless: 16;\n    --puck-font-size-s-unitless: 18;\n    --puck-font-size-m-unitless: 21;\n    --puck-font-size-l-unitless: 24;\n    --puck-font-size-xl-unitless: 28;\n    --puck-font-size-xxl-unitless: 36;\n    --puck-font-size-xxxl-unitless: 48;\n    --puck-font-size-xxxxl-unitless: 56;\n    --puck-font-size-xxxs: calc( 1rem * var(--puck-font-size-xxxs-unitless) / 16 );\n    --puck-font-size-xxs: calc(1rem * var(--puck-font-size-xxs-unitless) / 16);\n    --puck-font-size-xs: calc(1rem * var(--puck-font-size-xs-unitless) / 16);\n    --puck-font-size-s: calc(1rem * var(--puck-font-size-s-unitless) / 16);\n    --puck-font-size-m: calc(1rem * var(--puck-font-size-m-unitless) / 16);\n    --puck-font-size-l: calc(1rem * var(--puck-font-size-l-unitless) / 16);\n    --puck-font-size-xl: calc(1rem * var(--puck-font-size-xl-unitless) / 16);\n    --puck-font-size-xxl: calc(1rem * var(--puck-font-size-xxl-unitless) / 16);\n    --puck-font-size-xxxl: calc( 1rem * var(--puck-font-size-xxxl-unitless) / 16 );\n    --puck-font-size-xxxxl: calc( 1rem * var(--puck-font-size-xxxxl-unitless) / 16 );\n    --puck-font-size-base: var(--puck-font-size-xs);\n    --puck-line-height-reset: 1;\n    --puck-line-height-xs: calc( var(--puck-space-m-unitless) / var(--puck-font-size-m-unitless) );\n    --puck-line-height-s: calc( var(--puck-space-m-unitless) / var(--puck-font-size-s-unitless) );\n    --puck-line-height-m: calc( var(--puck-space-m-unitless) / var(--puck-font-size-xs-unitless) );\n    --puck-line-height-l: calc( var(--puck-space-m-unitless) / var(--puck-font-size-xxs-unitless) );\n    --puck-line-height-xl: calc( var(--puck-space-m-unitless) / var(--puck-font-size-scale-base-unitless) );\n    --puck-line-height-base: var(--puck-line-height-m);\n    --puck-fallback-font-stack:\n      -apple-system,\n      BlinkMacSystemFont,\n      Segoe UI,\n      Helvetica Neue,\n      sans-serif,\n      Apple Color Emoji,\n      Segoe UI Emoji,\n      Segoe UI Symbol;\n    --puck-font-family: Inter, var(--puck-fallback-font-stack);\n    --puck-font-family-monospaced:\n      ui-monospace,\n      "Cascadia Code",\n      "Source Code Pro",\n      Menlo,\n      Consolas,\n      "DejaVu Sans Mono",\n      monospace;\n  }\n  @supports (font-variation-settings: normal) {\n    :root {\n      --puck-font-family: InterVariable, var(--puck-fallback-font-stack);\n    }\n  }\n}\n\n/* bundle/core.css */\n:root {\n  --_puck-styles-loaded: "true";\n}\n#frame-root {\n  height: 1px;\n  min-height: 100vh;\n}\n[data-puck-entry] {\n  position: relative;\n  z-index: 0;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/ActionBar/styles.module.css/#css-module-data */\n._ActionBar_5vdfr_1 {\n  align-items: center;\n  cursor: default;\n  display: flex;\n  width: auto;\n  padding-top: var(--puck-actionbar-space-y, var(--puck-space-1));\n  padding-bottom: var(--puck-actionbar-space-y, var(--puck-space-1));\n  padding-inline-start: var(--puck-actionbar-space-x, 0);\n  padding-inline-end: var(--puck-actionbar-space-x, 0);\n  border-radius: var(--puck-actionbar-radius, var(--puck-radius-l));\n  background: var(--puck-actionbar-color-bg, var(--puck-color-surface-inverse));\n  color: var(--puck-color-text-inverse);\n  font-family: var(--puck-font-family);\n  min-height: 26px;\n}\n._ActionBar-label_5vdfr_17 {\n  color: var(--puck-actionbar-color-text, var(--puck-color-text-inverse));\n  font-size: var(--puck-actionbar-font-size, var(--puck-font-size-xxxs));\n  opacity: var(--puck-actionbar-opacity-text, var(--puck-opacity-text-inverse));\n  font-weight: var(--puck-font-weight-medium);\n  padding-inline-start: var(--puck-space-2);\n  padding-inline-end: var(--puck-space-2);\n  margin-inline-start: var(--puck-space-1);\n  margin-inline-end: var(--puck-space-1);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n._ActionBarAction_5vdfr_30 + ._ActionBar-label_5vdfr_17 {\n  padding-inline-start: 0;\n}\n._ActionBar-label_5vdfr_17 + ._ActionBarAction_5vdfr_30 {\n  margin-inline-start: calc(var(--puck-space-1) * -1);\n}\n._ActionBar-group_5vdfr_38 {\n  align-items: center;\n  border-inline-start: var(--puck-border-width-hairline) solid var(--puck-actionbar-color-separator, var(--puck-color-border-inverse));\n  display: flex;\n  height: 100%;\n  padding-inline-start: var(--puck-space-1);\n  padding-inline-end: var(--puck-space-1);\n}\n._ActionBar-group_5vdfr_38:first-of-type {\n  border-inline-start: 0;\n}\n._ActionBar-group_5vdfr_38:empty {\n  display: none;\n}\n._ActionBarAction_5vdfr_30 {\n  background: transparent;\n  border: none;\n  color: var(--puck-actionbar-color-text, var(--puck-color-text-inverse));\n  cursor: pointer;\n  padding: var(--puck-actionbar-action-space, 6px);\n  margin-inline-start: var(--puck-space-1);\n  margin-inline-end: var(--puck-space-1);\n  border-radius: var(--puck-radius-m);\n  overflow: hidden;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  opacity: var(--puck-actionbar-opacity-text, var(--puck-opacity-text-inverse));\n  transition: color var(--puck-duration-fast) var(--puck-ease-exit), opacity var(--puck-duration-fast) var(--puck-ease-exit);\n}\n._ActionBarAction--disabled_5vdfr_74 {\n  cursor: auto;\n  color: var( --puck-actionbar-color-action-disabled, var(--puck-color-text-inverse) );\n  opacity: var(--puck-actionbar-opacity-action-disabled, 0.54);\n}\n._ActionBarAction_5vdfr_30 svg {\n  max-width: none !important;\n}\n._ActionBarAction_5vdfr_30:focus-visible {\n  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);\n  outline-offset: calc(var(--puck-border-width-focus) * -1);\n}\n@media (hover: hover) and (pointer: fine) {\n  ._ActionBarAction_5vdfr_30:hover:not(._ActionBarAction--disabled_5vdfr_74) {\n    color: var( --puck-actionbar-color-action-hover, var(--puck-color-interactive-inverse-hover) );\n    opacity: 1;\n    transition: none;\n  }\n}\n._ActionBarAction_5vdfr_30:active:not(._ActionBarAction--disabled_5vdfr_74),\n._ActionBarAction--active_5vdfr_104 {\n  color: var( --puck-actionbar-color-action-active, var(--puck-color-interactive-inverse-active) );\n  opacity: 1;\n  transition: none;\n}\n._ActionBar-group_5vdfr_38 * {\n  margin: 0;\n}\n._ActionBar-separator_5vdfr_117 {\n  background: var( --puck-actionbar-color-separator, var(--puck-color-border-inverse) );\n  margin-inline: var(--puck-space-1);\n  width: var( --puck-border-width-hairline );\n  height: 100%;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/DraggableComponent/styles.module.css/#css-module-data */\n._DraggableComponent_1627v_1 {\n  position: absolute;\n  pointer-events: none;\n}\n._DraggableComponent-overlayWrapper_1627v_6 {\n  height: 100%;\n  width: 100%;\n  top: 0;\n  position: absolute;\n  pointer-events: none;\n  box-sizing: border-box;\n  z-index: 1;\n}\n._DraggableComponent-overlay_1627v_6 {\n  cursor: pointer;\n  height: 100%;\n  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var( --puck-slot-component-color-overlay-border, var(--puck-color-selection-border) ) solid;\n  outline-offset: calc(var(--puck-slot-component-border-width, var(--puck-border-width-focus)) * -1);\n  width: 100%;\n}\n._DraggableComponent_1627v_1:focus-visible > ._DraggableComponent-overlayWrapper_1627v_6 {\n  outline: var(--puck-border-width-regular) solid var(--puck-color-focus-ring);\n}\n._DraggableComponent-loadingOverlay_1627v_38 {\n  background: var(--puck-color-surface);\n  color: var(--puck-color-text);\n  border-radius: var(--puck-radius-m);\n  display: flex;\n  padding: var(--puck-space-2);\n  top: var(--puck-space-2);\n  right: var(--puck-space-2);\n  position: absolute;\n  z-index: 1;\n  pointer-events: all;\n  box-sizing: border-box;\n  opacity: 0.8;\n  z-index: 1;\n}\n._DraggableComponent--hover_1627v_54 > ._DraggableComponent-overlayWrapper_1627v_6 > ._DraggableComponent-overlay_1627v_6 {\n  background: var( --puck-slot-component-color-overlay, var(--puck-color-selection-bg) );\n  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var( --puck-slot-component-color-overlay-border, var(--puck-color-selection-border) ) solid;\n}\n._DraggableComponent--isSelected_1627v_72 > ._DraggableComponent-overlayWrapper_1627v_6 > ._DraggableComponent-overlay_1627v_6 {\n  outline-color: var( --puck-slot-component-color-border-selected, var(--puck-color-selection-border) );\n}\n._DraggableComponent_1627v_1:has(._DraggableComponent--hover_1627v_54 > ._DraggableComponent-overlayWrapper_1627v_6) > ._DraggableComponent-overlayWrapper_1627v_6 {\n  display: none;\n}\n._DraggableComponent-actionsOverlay_1627v_89 {\n  position: sticky;\n  opacity: 0;\n  pointer-events: none;\n  z-index: 2;\n}\n._DraggableComponent--isSelected_1627v_72 ._DraggableComponent-actionsOverlay_1627v_89 {\n  opacity: 1;\n  pointer-events: auto;\n}\n._DraggableComponent-actions_1627v_89 {\n  position: absolute;\n  width: auto;\n  cursor: grab;\n  display: flex;\n  box-sizing: border-box;\n  transform-origin: right top;\n  min-height: 36px;\n}\n._DraggableComponent-actionsAction_1627v_111 {\n  height: var(--puck-actionbar-action-size, var(--puck-icon-size-s));\n  width: var(--puck-actionbar-action-size, var(--puck-icon-size-s));\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/Drawer/styles.module.css/#css-module-data */\n._Drawer_1n90m_1 {\n  display: flex;\n  flex-direction: column;\n  font-family: var(--puck-font-family);\n  gap: var(--puck-space-3);\n}\n._Drawer-draggable_1n90m_8 {\n  position: relative;\n}\n._Drawer-draggableBg_1n90m_12 {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  pointer-events: none;\n  z-index: -1;\n}\n._DrawerItem-draggable_1n90m_22 {\n  background: var(--puck-drawer-item-color-bg, var(--puck-color-surface));\n  color: var(--puck-drawer-item-color-text, var(--puck-color-text));\n  cursor: grab;\n  padding: var(--puck-drawer-item-space, var(--puck-space-3));\n  display: flex;\n  border: var(--puck-drawer-item-border-width, var(--puck-border-width-regular)) var(--puck-drawer-item-color-border, var(--puck-color-border)) solid;\n  border-radius: var(--puck-drawer-item-radius, var(--puck-radius-m));\n  font-size: var(--puck-drawer-item-font-size, var(--puck-font-size-xxs));\n  justify-content: space-between;\n  align-items: center;\n  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit), color var(--puck-duration-fast) var(--puck-ease-exit);\n}\n._DrawerItem--disabled_1n90m_38 ._DrawerItem-draggable_1n90m_22 {\n  background: var(--puck-color-surface-muted);\n  color: var(--puck-color-text-muted);\n  cursor: not-allowed;\n}\n._DrawerItem_1n90m_22:focus-visible {\n  outline: 0;\n}\n._Drawer_1n90m_1:not(._Drawer--isDraggingFrom_1n90m_48) ._DrawerItem_1n90m_22:focus-visible ._DrawerItem-draggable_1n90m_22 {\n  border-radius: var(--puck-radius-m);\n  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);\n  outline-offset: var(--puck-border-width-focus);\n}\n@media (hover: hover) and (pointer: fine) {\n  ._Drawer_1n90m_1:not(._Drawer--isDraggingFrom_1n90m_48) ._DrawerItem_1n90m_22:not(._DrawerItem--disabled_1n90m_38) ._DrawerItem-draggable_1n90m_22:hover {\n    background-color: var( --puck-drawer-item-color-bg-hover, var(--puck-color-interactive-soft-hover) );\n    color: var( --puck-drawer-item-color-text-hover, var(--puck-color-interactive) );\n    transition: none;\n  }\n}\n._DrawerItem-name_1n90m_72 {\n  overflow-x: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/DropZone/styles.module.css/#css-module-data */\n._DropZone_wc2ks_1 {\n  position: relative;\n  height: 100%;\n  min-height: var(--puck-slot-min-empty-height);\n  outline-offset: calc(var(--puck-slot-border-width, var(--puck-border-width-focus)) * -1);\n  width: 100%;\n}\n._DropZone--hasChildren_wc2ks_11 {\n  min-height: 0;\n}\n._DropZone_wc2ks_1:empty {\n  min-height: var(--puck-slot-min-empty-height);\n}\n[data-puck-entry]:not([data-puck-dragging]) ._DropZone_wc2ks_1 {\n  transition: min-height var(--puck-duration-medium) var(--puck-ease-exit);\n}\n._DropZone--isAreaSelected_wc2ks_24,\n._DropZone--hoveringOverArea_wc2ks_25:not(._DropZone--isRootZone_wc2ks_25) {\n  background: var(--puck-slot-color-bg, var(--puck-color-selection-bg));\n  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));\n}\n._DropZone_wc2ks_1:empty {\n  background: var(--puck-slot-color-bg, var(--puck-color-selection-bg));\n  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));\n}\n._DropZone-item_wc2ks_39 {\n  position: relative;\n}\n._DropZone-linePlaceholder_wc2ks_43 {\n  background: var( --puck-slot-component-color-placeholder, var(--puck-color-line-placeholder) );\n  border-radius: calc(var(--puck-line-placeholder-width, 2px) / 2);\n  pointer-events: none;\n  position: absolute;\n  z-index: 1;\n}\n._DropZone-hitbox_wc2ks_55 {\n  position: absolute;\n  bottom: calc(var(--puck-space-3) * -1);\n  height: var(--puck-space-5);\n  width: 100%;\n  z-index: 1;\n}\n[data-puck-dragging] ._DropZone--isEnabled_wc2ks_63 {\n  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));\n}\n._DropZone_wc2ks_1 > *:not([data-puck-component]):not([data-puck-line-placeholder]) {\n  opacity: 0;\n}\nbody:has(._DropZone--isAnimating_wc2ks_74:empty) [data-puck-overlay] {\n  opacity: 0 !important;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/InlineTextField/styles.module.css/#css-module-data */\n._InlineTextField_104qp_1 {\n  cursor: text;\n  display: inline-block;\n  white-space: pre-wrap;\n  text-decoration: inherit;\n}\n[data-dnd-dragging] ._InlineTextField_104qp_1 {\n  cursor: none;\n  caret-color: transparent;\n}\n[data-dnd-dragging] ._InlineTextField_104qp_1::selection {\n  display: none;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/Loader/styles.module.css/#css-module-data */\n@keyframes _loader-animation_1w5zn_1 {\n  0% {\n    transform: rotate(0deg) scale(1);\n  }\n  50% {\n    transform: rotate(180deg) scale(0.8);\n  }\n  100% {\n    transform: rotate(360deg) scale(1);\n  }\n}\n._Loader_1w5zn_13 {\n  background: transparent;\n  border-radius: var(--puck-radius-round);\n  border: var(--puck-border-width-focus) solid currentColor;\n  border-bottom-color: transparent;\n  display: inline-block;\n  animation: _loader-animation_1w5zn_1 1s 0s infinite linear;\n  animation-fill-mode: both;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/RichTextMenu/styles.module.css/#css-module-data */\n._RichTextMenu_1ve2j_1 {\n  display: flex;\n  flex-direction: row;\n  flex-wrap: nowrap;\n}\n._RichTextMenu--form_1ve2j_7 {\n  border-top-left-radius: var(--puck-field-radius, var(--puck-radius-m));\n  border-top-right-radius: var(--puck-field-radius, var(--puck-radius-m));\n  padding: var(--puck-field-richtext-menu-space-y, 6px) var(--puck-field-richtext-menu-space-x, 6px);\n  background-color: var( --puck-field-richtext-menu-color-bg, var(--puck-color-surface-subtle) );\n  position: relative;\n  scrollbar-width: none;\n  overflow-x: auto;\n}\n._RichTextMenu-group_1ve2j_21 {\n  display: flex;\n  align-items: space-between;\n  flex-direction: row;\n  flex-wrap: nowrap;\n  padding-inline: 6px;\n  gap: 2px;\n  position: relative;\n}\n._RichTextMenu-group_1ve2j_21:first-of-type {\n  padding-left: 0;\n}\n._RichTextMenu-group_1ve2j_21:last-of-type {\n  padding-right: 0;\n}\n._RichTextMenu--inline_1ve2j_39 ._RichTextMenu-group_1ve2j_21 {\n  color: var(--puck-color-text-inverse);\n  gap: 0px;\n  flex-wrap: nowrap;\n}\n._RichTextMenu-group_1ve2j_21 + ._RichTextMenu-group_1ve2j_21 {\n  border-left: var(--puck-border-width-regular) solid var( --puck-field-richtext-menu-color-separator, var(--puck-color-border-muted) );\n}\n._RichTextMenu--inline_1ve2j_39 ._RichTextMenu-group_1ve2j_21 + ._RichTextMenu-group_1ve2j_21 {\n  border-left: var(--puck-border-width-hairline) solid var(--puck-color-border-inverse);\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/RichTextMenu/components/Control/styles.module.css/#css-module-data */\n._Control_id4pm_1 .lucide {\n  height: var(--puck-icon-size-m);\n  width: var(--puck-icon-size-m);\n}\n._Control--inline_id4pm_6 .lucide {\n  height: var(--puck-actionbar-action-size, var(--puck-icon-size-s));\n  width: var(--puck-actionbar-action-size, var(--puck-icon-size-s));\n}\n\n/* components/DraggableComponent/styles.css */\n[data-puck-component] * {\n  pointer-events: none;\n  user-select: none;\n  -webkit-user-select: none;\n}\n[data-puck-component] {\n  cursor: grab;\n  pointer-events: auto !important;\n  user-select: none;\n  -webkit-user-select: none;\n}\n[data-puck-dropzone] {\n  pointer-events: auto !important;\n}\n[data-puck-disabled] {\n  cursor: pointer;\n}\n[data-dnd-placeholder]:not([data-puck-line-drag] *) {\n  background: var( --puck-slot-component-color-placeholder, var(--puck-color-azure-06) ) !important;\n  border: none !important;\n  color: transparent !important;\n  opacity: 0.3 !important;\n  outline: none !important;\n  transition: none !important;\n}\n[data-dnd-placeholder]:not([data-puck-line-drag] *) *,\n[data-dnd-placeholder]:not([data-puck-line-drag] *)::after,\n[data-dnd-placeholder]:not([data-puck-line-drag] *)::before {\n  opacity: 0 !important;\n}\n[data-puck-line-drag] [data-dnd-placeholder] {\n  opacity: 0.4 !important;\n  outline: none !important;\n  transition: none !important;\n}\n[data-puck-line-drag] [data-dnd-dragging][data-puck-component] {\n  opacity: 0.9 !important;\n}\n[data-dnd-dragging][data-puck-component] {\n  pointer-events: none !important;\n  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var(--puck-slot-component-color-border-dragging, var(--puck-color-azure-09)) solid !important;\n  outline-offset: calc(var(--puck-slot-component-border-width, var(--puck-border-width-focus)) * -1) !important;\n}\n[data-dnd-dragging][data-puck-component] > :first-child {\n  margin-top: 0 !important;\n}\n[data-dnd-dragging][data-puck-component] > :last-child {\n  margin-bottom: 0 !important;\n}\n\n/* lib/overlay-portal/styles.css */\n[data-puck-overlay-portal],\n[data-puck-overlay-portal] * {\n  pointer-events: auto !important;\n}\n[data-puck-entry][data-puck-dragging] [data-puck-overlay-portal],\n[data-puck-entry][data-puck-dragging] [data-puck-overlay-portal] * {\n  pointer-events: none !important;\n}\n[data-puck-entry][data-puck-preview-mode=edit] [data-puck-overlay-portal]:hover {\n  outline: 2px var(--puck-color-azure-09, #cfdff0) dashed;\n  outline-offset: 2px;\n}\n[data-puck-entry][data-puck-preview-mode=edit] [data-puck-overlay-portal]:focus-within {\n  outline: 2px var(--puck-color-azure-07, #88b0da) dashed;\n  outline-offset: 2px;\n}',document:e,id:"iframe-styles"}:null),(0,cv.useEffect)(()=>{let a;if(!f||!e)return()=>{};let g=[],h={},i=()=>{g.forEach(({mirror:a})=>{a.remove()}),g=[],Array.from(e.head.querySelectorAll(`[${mu}="true"]`)).forEach(a=>{a.remove()}),Object.keys(h).forEach(a=>{delete h[a]})},j=a=>g.findIndex(b=>b.original===a),k=(a,c=!1)=>(0,cR.__async)(null,null,function*(){let d;if("LINK"===a.nodeName&&c){(d=document.createElement("style")).type="text/css";let c=mw(a);c||(yield new Promise(b=>{let c=()=>{b(),a.removeEventListener("load",c)};a.addEventListener("load",c)}),c=mw(a));let e=(a=>{if(a)try{return Array.from(a.cssRules).map(a=>a.cssText).join("")}catch(b){console.warn("Access to stylesheet %s is denied. Ignoring…",a.href)}return""})(c);if(!e){b&&console.warn("Tried to load styles for link element, but couldn't find them. Skipping...");return}d.innerHTML=e,d.setAttribute("data-href",a.getAttribute("href"))}else d=a.cloneNode(!0);return d.setAttribute(mu,"true"),d}),l=new MutationObserver(a=>{a.forEach(a=>{"childList"===a.type&&(a.addedNodes.forEach(a=>{if(a.nodeType===Node.TEXT_NODE||a.nodeType===Node.ELEMENT_NODE){let c=a.nodeType===Node.TEXT_NODE?a.parentElement:a;c&&mv(c)&&setTimeout(()=>(0,cR.__async)(null,null,function*(){let a=j(c);if(a>-1){b&&console.log("Tried to add an element that was already mirrored. Updating instead..."),g[a].mirror.innerText=c.innerText;return}let d=yield k(c);if(!d)return;let f=(0,ja.default)(d.outerHTML);if(h[f]){b&&console.log("iframe already contains element that is being mirrored. Skipping...");return}h[f]=!0,e.head.append(d),g.push({original:c,mirror:d}),b&&console.log(`Added style node ${c.outerHTML}`)}),0)}}),a.removedNodes.forEach(a=>{if(a.nodeType===Node.TEXT_NODE||a.nodeType===Node.ELEMENT_NODE){let c=a.nodeType===Node.TEXT_NODE?a.parentElement:a;c&&c.matches(mt)&&!mq(c)&&setTimeout(()=>(a=>{var c,d;let e=j(a);if(-1===e){b&&console.log("Tried to remove an element that did not exist. Skipping...");return}let f=(0,ja.default)(a.outerHTML);null==(d=null==(c=g[e])?void 0:c.mirror)||d.remove(),delete h[f],b&&console.log(`Removed style node ${a.outerHTML}`)})(c),0)}}))})});if(!d)return c(),()=>{l.disconnect(),i()};let m=f.parent.document,n=(a=[],m.querySelectorAll(mt).forEach(b=>{mv(b)&&a.push(b)}),a),o=[],p=0;return mx(m.getElementsByTagName("html")[0],e.documentElement),mx(m.getElementsByTagName("body")[0],e.body),Promise.all(n.map((a,b)=>(0,cR.__async)(null,null,function*(){if("LINK"===a.nodeName){let b=a.href;if(o.indexOf(b)>-1)return;o.push(b)}let b=yield k(a);if(b)return g.push({original:a,mirror:b}),b}))).then(a=>{let b=a.filter(a=>void 0!==a);b.forEach(a=>{a.onload=()=>{(p+=1)>=b.length&&c()},a.onerror=()=>{let d=a instanceof HTMLLinkElement?a.href:void 0;console.warn(`AutoFrame couldn't load a stylesheet${d?`: ${d}`:""}. This can happen if the parent document's stylesheet is blocked by the iframe's CSP, returns a non-2xx status, or fails to reach the network.`),(p+=1)>=b.length&&c()}}),e.head.querySelectorAll(`[${mu}="true"]`).forEach(a=>{a.remove()}),e.head.append(...b),b.forEach(a=>{"STYLE"===a.nodeName&&(p+=1)}),p>=b.length&&c(),l.observe(m.head,{childList:!0,subtree:!0}),b.forEach(a=>{h[(0,ja.default)(a.outerHTML)]=!0})}),()=>{l.disconnect(),i()}},[d]),(0,cS.jsx)(cS.Fragment,{children:a})},mz=(0,cv.createContext)({}),mA=()=>(0,cv.useContext)(mz);function mB(a){var{children:b,className:c,debug:d,id:e,onReady:f=()=>{},onNotReady:g=()=>{},frameRef:h,syncHostStyles:i=!0}=a,j=(0,cR.__objRest)(a,["children","className","debug","id","onReady","onNotReady","frameRef","syncHostStyles"]);let[k,l]=(0,cv.useState)(!1),[m,n]=(0,cv.useState)({}),[o,p]=(0,cv.useState)(),[q,r]=(0,cv.useState)(!1);return(0,cv.useEffect)(()=>{k&&r(!i)},[k,i]),(0,cv.useEffect)(()=>{var a;if(h.current){let b=h.current.contentDocument,c=h.current.contentWindow;n({document:b||void 0,window:c||void 0}),p(null==(a=h.current.contentDocument)?void 0:a.getElementById("frame-root")),b&&c&&q?f():g()}},[h,k,q]),(0,cS.jsx)("iframe",(0,cR.__spreadProps)((0,cR.__spreadValues)({},j),{className:c,id:e,srcDoc:'<!DOCTYPE html><html><head></head><body><div id="frame-root" data-puck-entry></div></body></html>',ref:h,onLoad:()=>{l(!0)},children:(0,cS.jsx)(mz.Provider,{value:m,children:k&&o&&(0,cS.jsx)(my,{debug:d,onStylesLoaded:()=>r(!0),syncHostStyles:i,children:(0,hr.createPortal)(b,o)})})}))}mB.displayName="AutoFrame",(0,cR.init_react_import)();var mC=cD(le),mD=(0,cv.memo)(()=>{var a,b,c,d;let e=(0,cP.useAppStore)(cU(a=>{var b;return null==(b=a.state.indexes.nodes.root)?void 0:b.flatData.props})),f=(0,cP.useAppStore)(a=>a.config),g=(0,cP.useAppStore)(a=>a.metadata),h=k_(f,(0,cv.useMemo)(()=>{let a=(0,cB.toComponent)({props:null!=e?e:{}});return(0,cB.expandNode)(a)},[e]),mC),i=(0,cv.useMemo)(()=>(0,cR.__spreadProps)((0,cR.__spreadValues)({},h),{children:(0,cS.jsx)(lk,{zone:cB.rootDroppableId}),puck:{renderDropZone:lk,isEditing:!0,dragRef:null,metadata:g},editMode:!0}),[h,g]),j=cK(null!=(b=null==(a=f.root)?void 0:a.fields)?b:{},i);return(null==(c=f.root)?void 0:c.render)?null==(d=f.root)?void 0:d.render((0,cR.__spreadProps)((0,cR.__spreadValues)((0,cR.__spreadValues)({},i),j),{id:"puck-root"})):(0,cS.jsx)(cS.Fragment,{children:i.children})});mD.displayName="EditorPage",(0,cR.init_react_import)();var mE=(0,cA.get_class_name_factory_default)("PuckPreview",{PuckPreview:"_PuckPreview_zbic3_1","PuckPreview-frame":"_PuckPreview-frame_zbic3_6"}),mF=({id:a="puck-preview"})=>{let b,c,d,e,f=(0,cP.useAppStore)(a=>a.dispatch),g=(0,cP.useAppStore)(a=>a.config),h=(0,cP.useAppStore)(a=>a.setStatus),i=(0,cP.useAppStore)(a=>a.iframe),j=(0,cP.useAppStore)(a=>a.overrides),k=(0,cP.useAppStore)(a=>a.metadata),l=(0,cP.useAppStore)(a=>"edit"===a.state.ui.previewMode?null:a.state.data),m=(0,cv.useMemo)(()=>j.iframe,[j]),n=(0,cv.useRef)(null);b=(0,cP.useAppStore)(a=>a.status),(0,cv.useEffect)(()=>{if(n.current&&"READY"===b){var a;let b=n.current,c=a=>{let c=new kF("pointermove",(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{bubbles:!0,cancelable:!1,clientX:a.clientX,clientY:a.clientY,pointerId:a.pointerId,pointerType:a.pointerType,isPrimary:a.isPrimary,originalTarget:a.target}));b.dispatchEvent(c)},d=()=>{var a;null==(a=b.contentDocument)||a.removeEventListener("pointermove",c)};return d(),null==(a=b.contentDocument)||a.addEventListener("pointermove",c,{capture:!0}),()=>{d()}}},[b]),c=(0,cP.useAppStore)(a=>a.state.ui.previewMode),d=(0,cP.useAppStore)(a=>a.status),e=(0,cP.useAppStore)(a=>a.iframe.enabled),(0,cv.useEffect)(()=>{var a,b;let d=e?null==(b=null==(a=n.current)?void 0:a.contentDocument)?void 0:b.querySelector("[data-puck-entry]"):n.current;null==d||d.setAttribute("data-puck-preview-mode",c)},[c,d,e]);let o=l?(0,cS.jsx)(ln,{data:l,config:g,metadata:k}):(0,cS.jsx)(mD,{});return(0,cv.useEffect)(()=>{i.enabled||h("READY")},[i.enabled]),(0,cS.jsx)("div",{className:mE(),id:a,"data-puck-preview":!0,onClick:a=>{let b=a.target;b.hasAttribute("data-puck-component")||b.hasAttribute("data-puck-dropzone")||f({type:"setUi",ui:{itemSelector:null}})},children:i.enabled?(0,cS.jsx)(mB,{id:"preview-frame",className:mE("frame"),"data-rfd-iframe":!0,syncHostStyles:i.syncHostStyles,onReady:()=>{h("READY")},onNotReady:()=>{h("MOUNTED")},frameRef:n,children:(0,cS.jsx)(mz.Consumer,{children:({document:a})=>m?(0,cS.jsx)(m,{document:a,children:o}):o})}):(0,cS.jsx)("div",{id:"preview-frame",className:mE("frame"),ref:n,"data-puck-entry":!0,children:o})})};(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var mG={Puck:"_Puck_tzaxg_19","Puck-portal":"_Puck-portal_tzaxg_31",PuckLayout:"_PuckLayout_tzaxg_36","PuckLayout-inner":"_PuckLayout-inner_tzaxg_40","Puck--hidePlugins":"_Puck--hidePlugins_tzaxg_73","PuckLayout--mounted":"_PuckLayout--mounted_tzaxg_78","PuckLayout--mobilePanelHeightToggle":"_PuckLayout--mobilePanelHeightToggle_tzaxg_82","PuckLayout--leftSideBarVisible":"_PuckLayout--leftSideBarVisible_tzaxg_82","PuckLayout--isExpanded":"_PuckLayout--isExpanded_tzaxg_90","PuckLayout--mobilePanelHeightMinContent":"_PuckLayout--mobilePanelHeightMinContent_tzaxg_110","PuckLayout--rightSideBarVisible":"_PuckLayout--rightSideBarVisible_tzaxg_137","PuckLayout-mounted":"_PuckLayout-mounted_tzaxg_156","PuckLayout-nav":"_PuckLayout-nav_tzaxg_197","PuckLayout-header":"_PuckLayout-header_tzaxg_217",PuckPluginTab:"_PuckPluginTab_tzaxg_231","PuckPluginTab--visible":"_PuckPluginTab--visible_tzaxg_237","PuckPluginTab-body":"_PuckPluginTab-body_tzaxg_243"};(0,cR.init_react_import)();var mH=({children:a})=>(0,cS.jsx)(cS.Fragment,{children:a});(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var mI=(0,cA.get_class_name_factory_default)("MenuBar",{MenuBar:"_MenuBar_1hxnj_1","MenuBar--menuOpen":"_MenuBar--menuOpen_1hxnj_14","MenuBar-inner":"_MenuBar-inner_1hxnj_29","MenuBar-history":"_MenuBar-history_1hxnj_45"});function mJ({menuOpen:a=!1,renderHeaderActions:b,setMenuOpen:c}){let d=(0,cP.useAppStore)(a=>a.history.back),e=(0,cP.useAppStore)(a=>a.history.forward),f=(0,cP.useAppStore)(a=>a.history.hasFuture()),g=(0,cP.useAppStore)(a=>a.history.hasPast()),h=(0,cP.useMessage)("header-undo"),i=(0,cP.useMessage)("header-redo");return(0,cS.jsx)("div",{className:mI({menuOpen:a}),onClick:a=>{var b;let d=a.target;!window.matchMedia("(min-width: 638px)").matches&&"A"===d.tagName&&(null==(b=d.getAttribute("href"))?void 0:b.startsWith("#"))&&c(!1)},children:(0,cS.jsxs)("div",{className:mI("inner"),children:[(0,cS.jsxs)("div",{className:mI("history"),children:[(0,cS.jsx)(cP.IconButton,{type:"button",title:h,disabled:!g,onClick:d,children:(0,cS.jsx)(cP.Undo2,{size:21})}),(0,cS.jsx)(cP.IconButton,{type:"button",title:i,disabled:!f,onClick:e,children:(0,cS.jsx)(cP.Redo2,{size:21})})]}),(0,cS.jsx)(cS.Fragment,{children:b&&b()})]})})}(0,cR.init_react_import)();var mK=(0,cA.get_class_name_factory_default)("PuckHeader",{PuckHeader:"_PuckHeader_c2nei_1","PuckHeader--hidePlugins":"_PuckHeader--hidePlugins_c2nei_21","PuckHeader-inner":"_PuckHeader-inner_c2nei_26","PuckHeader-toggle":"_PuckHeader-toggle_c2nei_46","PuckHeader-rightSideBarToggle":"_PuckHeader-rightSideBarToggle_c2nei_52","PuckHeader-leftSideBarToggle":"_PuckHeader-leftSideBarToggle_c2nei_53","PuckHeader-title":"_PuckHeader-title_c2nei_64","PuckHeader-path":"_PuckHeader-path_c2nei_68","PuckHeader-tools":"_PuckHeader-tools_c2nei_75","PuckHeader-menuButton":"_PuckHeader-menuButton_c2nei_81","PuckHeader--menuOpen":"_PuckHeader--menuOpen_c2nei_86"}),mL=(0,cv.memo)(({hidePlugins:a})=>{let{onPublish:b,renderHeader:c,renderHeaderActions:d,headerTitle:e,headerPath:f,iframe:g}=nj(),h=(0,cP.useAppStore)(a=>a.dispatch),i=(0,cP.useAppStoreApi)(),j=(0,cv.useMemo)(()=>c?(console.warn("`renderHeader` is deprecated. Please use `overrides.header` and the `usePuck` hook instead"),a=>{var{actions:b}=a,d=(0,cR.__objRest)(a,["actions"]);let e=(0,cP.useAppStore)(a=>a.state);return(0,cS.jsx)(c,(0,cR.__spreadProps)((0,cR.__spreadValues)({},d),{dispatch:h,state:e,children:b}))}):mH,[c]),k=(0,cv.useMemo)(()=>d?(console.warn("`renderHeaderActions` is deprecated. Please use `overrides.headerActions` and the `usePuck` hook instead."),a=>{let b=(0,cP.useAppStore)(a=>a.state);return(0,cS.jsx)(d,(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{dispatch:h,state:b}))}):mH,[d]),l=(0,cP.useAppStore)(a=>a.overrides.header||j),m=(0,cP.useAppStore)(a=>a.overrides.headerActions||k),[n,o]=(0,cv.useState)(!1),p=(0,cP.useAppStore)(a=>{var b,c;return null!=(c=(null==(b=a.state.indexes.nodes.root)?void 0:b.data).props.title)?c:""}),q=(0,cP.useAppStore)(a=>a.state.ui.leftSideBarVisible),r=(0,cP.useAppStore)(a=>a.state.ui.rightSideBarVisible),s=(0,cv.useCallback)(a=>{let b=window.matchMedia("(min-width: 638px)").matches,c="left"===a?q:r;h({type:"setUi",ui:(0,cR.__spreadValues)({[`${a}SideBarVisible`]:!c},b?{}:{["left"===a?"rightSideBarVisible":"leftSideBarVisible"]:!1})})},[h,q,r]),t=(0,cP.useMessage)("header-publish"),u=(0,cP.useMessage)("label-page"),v=(0,cP.useMessage)("header-toggle-leftsidebar"),w=(0,cP.useMessage)("header-toggle-rightsidebar"),y=(0,cP.useMessage)("header-toggle-menubar");return(0,cS.jsx)(l,{actions:(0,cS.jsx)(cS.Fragment,{children:(0,cS.jsx)(m,{children:(0,cS.jsx)(jf,{onClick:()=>{let a=i.getState().state.data;b&&b(a)},icon:(0,cS.jsx)(cP.Globe,{size:"14px"}),children:t})})}),children:(0,cS.jsx)("header",{className:mK({leftSideBarVisible:q,rightSideBarVisible:r,hidePlugins:a}),children:(0,cS.jsxs)("div",{className:mK("inner"),children:[(0,cS.jsxs)("div",{className:mK("toggle"),children:[(0,cS.jsx)("div",{className:mK("leftSideBarToggle"),children:(0,cS.jsx)(cP.IconButton,{type:"button",onClick:()=>{s("left")},title:v,children:(0,cS.jsx)(cP.PanelLeft,{focusable:"false"})})}),(0,cS.jsx)("div",{className:mK("rightSideBarToggle"),children:(0,cS.jsx)(cP.IconButton,{type:"button",onClick:()=>{s("right")},title:w,children:(0,cS.jsx)(cP.PanelRight,{focusable:"false"})})})]}),(0,cS.jsx)("div",{className:mK("title"),children:(0,cS.jsxs)(jZ,{rank:"2",size:"xs",children:[e||p||u,f&&(0,cS.jsxs)(cS.Fragment,{children:[" ",(0,cS.jsx)("code",{className:mK("path"),children:f})]})]})}),(0,cS.jsxs)("div",{className:mK("tools"),children:[(0,cS.jsx)("div",{className:mK("menuButton"),children:(0,cS.jsx)(cP.IconButton,{type:"button",onClick:()=>o(!n),title:y,children:n?(0,cS.jsx)(cP.ChevronUp,{focusable:"false"}):(0,cS.jsx)(cP.ChevronDown,{focusable:"false"})})}),(0,cS.jsx)(mJ,{dispatch:h,onPublish:b,menuOpen:n,renderHeaderActions:()=>(0,cS.jsx)(m,{children:(0,cS.jsx)(jf,{onClick:()=>{let a=i.getState().state.data;b&&b(a)},icon:(0,cS.jsx)(cP.Globe,{size:"14px"}),children:t})}),setMenuOpen:o})]})]})})})});(0,cR.init_react_import)(),(0,cR.init_react_import)();var mM=(0,cA.get_class_name_factory_default)("SidebarSection",{SidebarSection:"_SidebarSection_1uv88_1","SidebarSection-title":"_SidebarSection-title_1uv88_12","SidebarSection--noBorderTop":"_SidebarSection--noBorderTop_1uv88_20","SidebarSection-content":"_SidebarSection-content_1uv88_24","SidebarSection-breadcrumbLabel":"_SidebarSection-breadcrumbLabel_1uv88_33","SidebarSection-breadcrumbs":"_SidebarSection-breadcrumbs_1uv88_62","SidebarSection-breadcrumb":"_SidebarSection-breadcrumb_1uv88_33","SidebarSection-heading":"_SidebarSection-heading_1uv88_74","SidebarSection-loadingOverlay":"_SidebarSection-loadingOverlay_1uv88_78"}),mN=({children:a,title:b,background:c,showBreadcrumbs:d,noBorderTop:e,isLoading:f})=>(0,cS.jsxs)("div",{className:mM({noBorderTop:e}),style:{background:c},children:[(0,cS.jsx)("div",{className:mM("title"),children:(0,cS.jsxs)("div",{className:mM("breadcrumbs"),children:[d&&(0,cS.jsx)(md,{}),(0,cS.jsx)("div",{className:mM("heading"),children:(0,cS.jsx)(jZ,{rank:"2",size:"xs",children:b})})]})}),(0,cS.jsx)("div",{className:mM("content"),children:a}),f&&(0,cS.jsx)("div",{className:mM("loadingOverlay"),children:(0,cS.jsx)(cP.Loader,{size:32})})]});(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var mO={ViewportControls:"_ViewportControls_v26yb_1","ViewportControls--fullScreen":"_ViewportControls--fullScreen_v26yb_5","ViewportControls-toggleButton":"_ViewportControls-toggleButton_v26yb_14","ViewportControls-actions":"_ViewportControls-actions_v26yb_39","ViewportControls-actionsInner":"_ViewportControls-actionsInner_v26yb_43","ViewportControls--isExpanded":"_ViewportControls--isExpanded_v26yb_67","ViewportControls-divider":"_ViewportControls-divider_v26yb_72","ViewportControls-zoomSelect":"_ViewportControls-zoomSelect_v26yb_79","ViewportControls-zoom":"_ViewportControls-zoom_v26yb_79","ViewportButton-inner":"_ViewportButton-inner_v26yb_110","ViewportButton--isActive":"_ViewportButton--isActive_v26yb_118"},mP={Smartphone:(0,cS.jsx)(cP.Smartphone,{size:16}),Tablet:(0,cS.jsx)(cP.Tablet,{size:16}),Monitor:(0,cS.jsx)(cP.Monitor,{size:16}),FullWidth:(0,cS.jsx)(cP.Expand,{size:16})},mQ=(0,cA.get_class_name_factory_default)("ViewportControls",mO),mR=(0,cA.get_class_name_factory_default)("ViewportButton",mO),mS=({children:a,title:b,onClick:c,isActive:d,disabled:e})=>(0,cS.jsx)("span",{className:mR({isActive:d}),suppressHydrationWarning:!0,children:(0,cS.jsx)(cP.IconButton,{type:"button",title:b,disabled:e||d,onClick:c,suppressHydrationWarning:!0,children:(0,cS.jsx)("span",{className:mR("inner"),children:a})})}),mT=[{label:"25%",value:.25},{label:"50%",value:.5},{label:"75%",value:.75},{label:"100%",value:1},{label:"125%",value:1.25},{label:"150%",value:1.5},{label:"200%",value:2}],mU=({viewport:a,isActive:b,onClick:c})=>{var d;let e=(0,cP.useMessage)("viewport-switch",{label:null!=(d=a.label)?d:""}),f=(0,cP.useMessage)("viewport-switch-default");return(0,cS.jsx)(mS,{title:a.label?e:f,onClick:c,isActive:b,children:"string"==typeof a.icon?mP[a.icon]||a.icon:a.icon||mP.Smartphone})},mV=({autoZoom:a,zoom:b,onViewportChange:c,onZoom:d,fullScreen:e})=>{var f,g;let h=(0,cP.useAppStore)(a=>a.viewports),i=(0,cP.useAppStore)(a=>a.state.ui.viewports),j=mT.find(b=>b.value===a),k=(0,cP.useMessage)("viewport-zoom-auto",{zoom:(100*a).toFixed(0)}),l=(0,cv.useMemo)(()=>[...mT,...j?[]:[{value:a,label:k}]].filter(b=>b.value<=a).sort((a,b)=>a.value>b.value?1:-1),[a,k]),[m,n]=(0,cv.useState)(i.current.width);(0,cv.useEffect)(()=>{n(i.current.width)},[i.current]);let[o,p]=(0,cv.useState)(!1),q=(0,cP.useMessage)("viewport-zoom-out"),r=(0,cP.useMessage)("viewport-zoom-in"),s=(0,cP.useMessage)("viewport-toggle-menu");return(0,cS.jsxs)("div",{className:mQ({isExpanded:o,fullScreen:e}),suppressHydrationWarning:!0,children:[(0,cS.jsx)("div",{className:mQ("actions"),children:(0,cS.jsxs)("div",{className:mQ("actionsInner"),children:[h.map((a,b)=>(0,cS.jsx)(mU,{viewport:a,onClick:()=>{n(a.width),c(a)},isActive:m===a.width},b)),(0,cS.jsx)("div",{className:mQ("divider")}),(0,cS.jsx)(mS,{title:q,disabled:b<=(null==(f=l[0])?void 0:f.value),onClick:a=>{a.stopPropagation(),d(l[Math.max(l.findIndex(a=>a.value===b)-1,0)].value)},children:(0,cS.jsx)(cP.ZoomOut,{size:16})}),(0,cS.jsx)(mS,{title:r,disabled:b>=(null==(g=l[l.length-1])?void 0:g.value),onClick:a=>{a.stopPropagation(),d(l[Math.min(l.findIndex(a=>a.value===b)+1,l.length-1)].value)},children:(0,cS.jsx)(cP.ZoomIn,{size:16})}),(0,cS.jsxs)("div",{className:mQ("zoom"),children:[(0,cS.jsx)("div",{className:mQ("divider")}),(0,cS.jsx)("select",{className:mQ("zoomSelect"),value:b.toString(),onClick:a=>{a.stopPropagation()},onChange:a=>{d(parseFloat(a.currentTarget.value))},children:l.map(a=>(0,cS.jsx)("option",{value:a.value,label:a.label},a.label))})]})]})}),(0,cS.jsx)("button",{className:mQ("toggleButton"),title:s,onClick:()=>p(a=>!a),children:o?(0,cS.jsx)(cP.X,{size:16}):(0,cS.jsx)(cP.Monitor,{size:16})})]})};(0,cR.init_react_import)(),(0,cR.init_react_import)();var mW=(0,cv.createContext)(null),mX=({children:a})=>{let b=(0,cv.useRef)(null),c=(0,cv.useMemo)(()=>({frameRef:b}),[]);return(0,cS.jsx)(mW.Provider,{value:c,children:a})},mY=()=>{let a=(0,cv.useContext)(mW);if(null===a)throw Error("useCanvasFrame must be used within a FrameProvider");return a},mZ=(0,cA.get_class_name_factory_default)("PuckCanvas",{PuckCanvas:"_PuckCanvas_zw9iy_1","PuckCanvas-controls":"_PuckCanvas-controls_zw9iy_18","PuckCanvas--fullScreen":"_PuckCanvas--fullScreen_zw9iy_23","PuckCanvas-inner":"_PuckCanvas-inner_zw9iy_34","PuckCanvas-root":"_PuckCanvas-root_zw9iy_43","PuckCanvas--ready":"_PuckCanvas--ready_zw9iy_68","PuckCanvas-loader":"_PuckCanvas-loader_zw9iy_73","PuckCanvas--showLoader":"_PuckCanvas--showLoader_zw9iy_84"}),m$=()=>{var a;let{frameRef:b}=mY(),c=(0,cP.useResetAutoZoom)(b),{viewports:d=cz.defaultViewports,ui:e}=nj(),{dispatch:f,overrides:g,setUi:h,zoomConfig:i,setZoomConfig:j,status:k,iframe:l,_experimentalFullScreenCanvas:m}=(0,cP.useAppStore)(cU(a=>({dispatch:a.dispatch,overrides:a.overrides,setUi:a.setUi,zoomConfig:a.zoomConfig,setZoomConfig:a.setZoomConfig,status:a.status,iframe:a.iframe,_experimentalFullScreenCanvas:a._experimentalFullScreenCanvas}))),{leftSideBarVisible:n,rightSideBarVisible:o,leftSideBarWidth:p,rightSideBarWidth:q,viewports:r}=(0,cP.useAppStore)(cU(a=>({leftSideBarVisible:a.state.ui.leftSideBarVisible,rightSideBarVisible:a.state.ui.rightSideBarVisible,leftSideBarWidth:a.state.ui.leftSideBarWidth,rightSideBarWidth:a.state.ui.rightSideBarWidth,viewports:a.state.ui.viewports}))),[s,t]=(0,cv.useState)(!1),u=(0,cv.useRef)(!1),v=(0,cv.useMemo)(()=>({children:a})=>(0,cS.jsx)(cS.Fragment,{children:a}),[]),w=(0,cv.useMemo)(()=>g.preview||v,[g]),y=(0,cv.useCallback)(()=>{if(b.current){let a=b.current,c=(0,cP.getBox)(a);return{width:c.contentBox.width,height:c.contentBox.height}}return{width:0,height:0}},[b]);(0,cv.useEffect)(()=>{c()},[b,n,o,p,q,r]),(0,cv.useEffect)(()=>{let{height:a}=y();"auto"===r.current.height&&j((0,cR.__spreadProps)((0,cR.__spreadValues)({},i),{rootHeight:a/i.zoom}))},[i.zoom,y,j]),(0,cv.useEffect)(()=>{c()},[r.current.width,r]),(0,cv.useEffect)(()=>{if(!b.current)return;let a=new ResizeObserver(()=>{u.current||c()});return a.observe(b.current),()=>{a.disconnect()}},[b.current]);let[z,A]=(0,cv.useState)(!1);(0,cv.useEffect)(()=>{setTimeout(()=>{A(!0)},500)},[]);let B=(0,cP.useAppStoreApi)();return(0,cv.useEffect)(()=>{},[d,b.current,l,B,null==(a=null==e?void 0:e.viewports)?void 0:a.current]),(0,cS.jsxs)("div",{className:mZ({ready:"READY"===k||!l.enabled||!l.waitForStyles,showLoader:z,fullScreen:m}),onClick:a=>{let b=a.target;b.hasAttribute("data-puck-component")||b.hasAttribute("data-puck-dropzone")||f({type:"setUi",ui:{itemSelector:null},recordHistory:!1})},children:[r.controlsVisible&&l.enabled&&(0,cS.jsx)("div",{className:mZ("controls"),children:(0,cS.jsx)(mV,{fullScreen:m,autoZoom:i.autoZoom,zoom:i.zoom,onViewportChange:a=>{t(!0),u.current=!0;let b=(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{height:a.height||"auto",zoom:i.zoom});h({viewports:(0,cR.__spreadProps)((0,cR.__spreadValues)({},r),{current:b})}),c({viewports:(0,cR.__spreadProps)((0,cR.__spreadValues)({},r),{current:b})})},onZoom:a=>{t(!0),u.current=!0,j((0,cR.__spreadProps)((0,cR.__spreadValues)({},i),{zoom:a}))}})}),(0,cS.jsxs)("div",{className:mZ("inner"),ref:b,children:[(0,cS.jsx)("div",{className:mZ("root"),style:{width:l.enabled?r.current.width:"100%",height:i.rootHeight,transform:l.enabled?`scale(${i.zoom})`:void 0,transition:s?"width 150ms ease-out, height 150ms ease-out, transform 150ms ease-out":"",overflow:l.enabled?void 0:"auto"},suppressHydrationWarning:!0,id:"puck-canvas-root",onTransitionEnd:()=>{t(!1),u.current=!1},children:(0,cS.jsx)(w,{children:(0,cS.jsx)(mF,{})})}),(0,cS.jsx)("div",{className:mZ("loader"),children:(0,cS.jsx)(cP.Loader,{size:24})})]})]})};function m_(a,b){let[c,d]=(0,cv.useState)(null),e=(0,cv.useRef)(null),f=(0,cP.useAppStore)(b=>"left"===a?b.state.ui.leftSideBarWidth:b.state.ui.rightSideBarWidth);return(0,cv.useEffect)(()=>{},[b,a,f]),(0,cv.useEffect)(()=>{void 0!==f&&d(f)},[f]),{width:c,setWidth:d,sidebarRef:e,handleResizeEnd:(0,cv.useCallback)(c=>{b({type:"setUi",ui:{["left"===a?"leftSideBarWidth":"rightSideBarWidth"]:c}});let d={};try{let a=localStorage.getItem("puck-sidebar-widths");d=a?JSON.parse(a):{}}catch(b){console.error(`Failed to save ${a} sidebar width to localStorage`,b)}finally{localStorage.setItem("puck-sidebar-widths",JSON.stringify((0,cR.__spreadProps)((0,cR.__spreadValues)({},d),{[a]:c})))}window.dispatchEvent(new CustomEvent("viewportchange",{bubbles:!0,cancelable:!1}))},[b,a])}}(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var m0=(0,cA.get_class_name_factory_default)("ResizeHandle",{ResizeHandle:"_ResizeHandle_144bf_2","ResizeHandle--left":"_ResizeHandle--left_144bf_16","ResizeHandle--right":"_ResizeHandle--right_144bf_20"}),m1=({position:a,sidebarRef:b,onResize:c,onResizeEnd:d})=>{let{frameRef:e}=mY(),f=(0,cP.useResetAutoZoom)(e),g=(0,cv.useRef)(null),h=(0,cv.useRef)(!1),i=(0,cv.useRef)(0),j=(0,cv.useRef)(0),k=(0,cv.useCallback)(b=>{if(!h.current)return;let d=b.clientX-i.current;c(Math.max(192,"left"===a?j.current+d:j.current-d)),b.preventDefault()},[c,a]),l=(0,cv.useCallback)(()=>{var a;if(!h.current)return;h.current=!1,document.body.style.cursor="",document.body.style.userSelect="";let c=document.getElementById("resize-overlay");c&&document.body.removeChild(c),document.removeEventListener("mousemove",k),document.removeEventListener("mouseup",l),d((null==(a=b.current)?void 0:a.getBoundingClientRect().width)||0),f()},[d]),m=(0,cv.useCallback)(a=>{var c;h.current=!0,i.current=a.clientX,j.current=(null==(c=b.current)?void 0:c.getBoundingClientRect().width)||0,document.body.style.cursor="col-resize",document.body.style.userSelect="none";let d=document.createElement("div");d.id="resize-overlay",d.setAttribute("data-resize-overlay",""),document.body.appendChild(d),document.addEventListener("mousemove",k),document.addEventListener("mouseup",l),a.preventDefault()},[a,k,l]);return(0,cS.jsx)("div",{ref:g,className:m0({[a]:!0}),onMouseDown:m})};(0,cR.init_react_import)();var m2=(0,cA.get_class_name_factory_default)("Sidebar",{Sidebar:"_Sidebar_16oed_1","Sidebar--isVisible":"_Sidebar--isVisible_16oed_10","Sidebar--left":"_Sidebar--left_16oed_14","Sidebar--right":"_Sidebar--right_16oed_34","Sidebar-resizeHandle":"_Sidebar-resizeHandle_16oed_51"}),m3=({position:a,sidebarRef:b,isVisible:c,onResize:d,onResizeEnd:e,children:f})=>(0,cS.jsxs)(cS.Fragment,{children:[(0,cS.jsx)("div",{ref:b,className:m2({[a]:!0,isVisible:c}),children:f}),(0,cS.jsx)("div",{className:`${m2("resizeHandle")}`,children:(0,cS.jsx)(m1,{position:a,sidebarRef:b,onResize:d,onResizeEnd:e})})]});(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)();var m4={Nav:"_Nav_vll2r_1","Nav-list":"_Nav-list_vll2r_5","Nav-mobileActions":"_Nav-mobileActions_vll2r_23","NavItem-link":"_NavItem-link_vll2r_39",NavItem:"_NavItem_vll2r_39","NavItem-linkIcon":"_NavItem-linkIcon_vll2r_90","NavItem--active":"_NavItem--active_vll2r_100","NavItem--mobileOnly":"_NavItem--mobileOnly_vll2r_136","NavItem--desktopOnly":"_NavItem--desktopOnly_vll2r_141"},m5=(0,cA.get_class_name_factory_default)("Nav",m4),m6=(0,cA.get_class_name_factory_default)("NavItem",m4),m7=({label:a,icon:b,onClick:c,isActive:d,mobileOnly:e,desktopOnly:f})=>(0,cS.jsx)("li",{className:m6({active:d,mobileOnly:e,desktopOnly:f}),children:c&&(0,cS.jsxs)("div",{className:m6("link"),onClick:c,children:[b&&(0,cS.jsx)("span",{className:m6("linkIcon"),children:b}),(0,cS.jsx)("span",{className:m6("linkLabel"),children:a})]})}),m8=({items:a,mobileActions:b})=>(0,cS.jsxs)("nav",{className:m5(),children:[(0,cS.jsx)("ul",{className:m5("list"),children:Object.entries(a).map(([a,b])=>(0,cS.jsx)(m7,(0,cR.__spreadValues)({},b),a))}),b&&(0,cS.jsx)("div",{className:m5("mobileActions"),children:b})]});(0,cR.init_react_import)();var m9=a=>(0,cR.__spreadValues)({enabled:!0,waitForStyles:!0,syncHostStyles:!0},a),na=(0,cA.get_class_name_factory_default)("Puck",mG),nb=(0,cA.get_class_name_factory_default)("PuckLayout",mG),nc=(0,cA.get_class_name_factory_default)("PuckPluginTab",mG),nd=cv.useEffect,ne=()=>{let a=(0,cP.useMessage)("label-page"),b=(0,cP.useAppStore)(a=>{var b,c,d;return a.selectedItem?null!=(c=null==(b=a.config.components[a.selectedItem.type])?void 0:b.label)?c:a.selectedItem.type.toString():null==(d=a.config.root)?void 0:d.label});return(0,cS.jsx)(mN,{noBorderTop:!0,showBreadcrumbs:!0,title:b||a,children:(0,cS.jsx)(mi,{})})},nf=({children:a,visible:b,mobileOnly:c})=>(0,cS.jsx)("div",{className:nc({visible:b,mobileOnly:c}),children:(0,cS.jsx)("div",{className:nc("body"),children:a})}),ng=({children:a})=>{var b,c;let d,e,f,g,{iframe:h,initialHistory:i,plugins:j,height:k}=nj(),l=(0,cP.useAppStore)(a=>a.dnd),m=(0,cv.useMemo)(()=>m9(h),[h]);mr((null!==ms?ms:!("u"<typeof document)&&(ms=""!==getComputedStyle(document.documentElement).getPropertyValue("--_puck-styles-loaded").trim()))?null:{cssText:ml,id:"ui-default",prepend:!0}),(0,cv.useEffect)(()=>{},[]);let n=(0,cP.useAppStore)(a=>a.dispatch),o=(0,cP.useAppStore)(a=>a.state.ui.leftSideBarVisible),p=(0,cP.useAppStore)(a=>a.state.ui.rightSideBarVisible),q=(0,cP.useAppStore)(a=>a.instanceId),{width:r,setWidth:s,sidebarRef:t,handleResizeEnd:u}=m_("left",n),{width:v,setWidth:w,sidebarRef:y,handleResizeEnd:z}=m_("right",n);(0,cv.useEffect)(()=>{window.matchMedia("(min-width: 638px)").matches||n({type:"setUi",ui:{leftSideBarVisible:!1,rightSideBarVisible:!1}});let a=()=>{window.matchMedia("(min-width: 638px)").matches||n({type:"setUi",ui:a=>(0,cR.__spreadValues)((0,cR.__spreadValues)({},a),a.rightSideBarVisible?{leftSideBarVisible:!1}:{})})};return window.addEventListener("resize",a),()=>{window.removeEventListener("resize",a)}},[]);let A=(0,cP.useAppStore)(a=>a.overrides),B=(0,cv.useMemo)(()=>A.puck||mH,[A]),[C,D]=(0,cv.useState)(!1);nd(()=>{D(!0)},[]);let E=(0,cP.useAppStore)(a=>"READY"===a.status);(0,cP.useMonitorHotkeys)(),(0,cv.useEffect)(()=>{if(E&&m.enabled){let a=kn();if(a)return(0,cP.monitorHotkeys)(a)}},[E,m.enabled]),d=(0,cP.useAppStoreApi)(),e=(0,cv.useCallback)(()=>{(0,d.getState().dispatch)({type:"setUi",ui:a=>({previewMode:"edit"===a.previewMode?"interactive":"edit"})})},[d]),(0,cP.useHotkey)({meta:!0,i:!0},e),(0,cP.useHotkey)({ctrl:!0,i:!0},e),f=(0,cP.useAppStoreApi)(),g=(0,cv.useCallback)(a=>{var b;if((a=>{var b;if(null==a?void 0:a.defaultPrevented)return!0;let c=(null==(b=null==a?void 0:a.composedPath)?void 0:b.call(a)[0])||(null==a?void 0:a.target)||document.activeElement;if(c instanceof HTMLElement){let a=c.tagName.toLowerCase();if("input"===a||"textarea"===a||"select"===a||c.isContentEditable)return!0;let b=c.getAttribute("role");if("textbox"===b||"combobox"===b||"searchbox"===b||"listbox"===b||"grid"===b)return!0}let d=document.querySelector('dialog[open], [aria-modal="true"], [role="dialog"], [role="alertdialog"]');return!!(d&&(a=>{let b=a;for(;b&&b!==document.body;){let a=window.getComputedStyle(b);if("none"===a.display||"hidden"===a.visibility||"0"===a.opacity||"true"===b.getAttribute("aria-hidden")||b.hasAttribute("hidden"))return!1;b=b.parentElement}return!0})(d))})(a))return!1;let{state:c,dispatch:d,permissions:e,selectedItem:g}=f.getState(),h=null==(b=c.ui)?void 0:b.itemSelector;return null==h||!h.zone||!g||!e.getPermissions({item:g}).delete||(d({type:"remove",index:h.index,zone:h.zone}),!0)},[f]),(0,cP.useHotkey)({delete:!0},g),(0,cP.useHotkey)({backspace:!0},g);let F={};r&&(F["--puck-user-sidebar-left-width"]=`${r}px`),v&&(F["--puck-user-sidebar-right-width"]=`${v}px`);let G=(0,cP.useAppStore)(a=>a.setUi),H=(0,cP.useAppStore)(a=>{var b;return null==(b=a.state.ui.plugin)?void 0:b.current}),I=(0,cP.useAppStoreApi)(),J=(0,cv.useMemo)(()=>!!(null==j?void 0:j.find(a=>"legacy-side-bar"===a.name)),[j]),K=(0,cP.useMessage)("plugin-blocks"),L=(0,cP.useMessage)("plugin-outline"),M=(0,cP.useMessage)("plugin-fields"),N=(0,cv.useMemo)(()=>{let a={},b=[((a={})=>{var b,c;return{name:"blocks",label:null!=(b=a.label)?b:"Blocks",render:()=>(0,cS.jsx)("div",{className:lv(),children:(0,cS.jsx)(lu,{})}),icon:null!=(c=a.icon)?c:(0,cS.jsx)(cP.Hammer,{})}})({label:K}),((a={})=>{var b,c;return{name:"outline",label:null!=(b=a.label)?b:"Outline",render:()=>(0,cS.jsx)("div",{className:mb(),children:(0,cS.jsx)(ma,{})}),icon:null!=(c=a.icon)?c:(0,cS.jsx)(cP.Layers,{})}})({label:L})],c=a=>"legacy-side-bar"===a.name?-1:0,d=[...b,...null!=j?j:[]].sort((a,b)=>c(a)-c(b));return(null==j?void 0:j.some(a=>"fields"===a.name))||d.push((({desktopSideBar:a="right",label:b,icon:c}={})=>({name:"fields",label:null!=b?b:"Fields",render:()=>(0,cS.jsxs)("div",{className:mj(),children:[(0,cS.jsx)("div",{className:mj("header"),children:(0,cS.jsx)(md,{numParents:2,children:(0,cS.jsx)(mk,{})})}),(0,cS.jsx)(mi,{})]}),icon:null!=c?c:(0,cS.jsx)(cP.RectangleEllipsis,{}),mobileOnly:"right"===a}))({label:M})),null==d||d.forEach(b=>{var c,d,e;b.name&&b.render&&(a[b.name]&&delete a[b.name],a[b.name]={label:null!=(c=b.label)?c:b.name,icon:null!=(d=b.icon)?d:(0,cS.jsx)(cP.ToyBrick,{}),onClick:()=>{b.name===H?o?G({leftSideBarVisible:!1}):G({leftSideBarVisible:!0}):b.name&&G({plugin:{current:b.name},leftSideBarVisible:!0})},isActive:o&&H===b.name,render:b.render,mobilePanelHeight:null!=(e=b.mobilePanelHeight)?e:"toggle",mobileOnly:J||b.mobileOnly,desktopOnly:"legacy-side-bar"===b.name||b.desktopOnly})}),a},[j,H,I,o,K,L,M]),O=null!=H?H:Object.keys(N)[0],P=null!=(c=null==(b=N[O])?void 0:b.mobilePanelHeight)?c:"toggle";(0,cv.useEffect)(()=>{H||G({plugin:{current:Object.keys(N)[0]}})},[N,H]);let Q=N.fields&&!1===N.fields.mobileOnly,R=(0,cP.useAppStore)(a=>{var b;return null!=(b=a.state.ui.mobilePanelExpanded)&&b}),S=(0,cP.useMessage)("layout-maximize"),T=(0,cP.useMessage)("layout-minimize");return(0,cS.jsxs)("div",{className:`Puck ${na({hidePlugins:J})}`,id:q,style:{height:k,visibility:"hidden"},children:[(0,cS.jsx)(kT,{disableAutoScroll:null==l?void 0:l.disableAutoScroll,behavior:null==l?void 0:l.behavior,children:(0,cS.jsx)(B,{children:a||(0,cS.jsx)(mX,{children:(0,cS.jsx)("div",{className:nb({leftSideBarVisible:o,mounted:C,rightSideBarVisible:!Q&&p,isExpanded:R,mobilePanelHeightToggle:"toggle"===P,mobilePanelHeightMinContent:"min-content"===P}),style:{height:k},children:(0,cS.jsxs)("div",{className:nb("inner"),style:F,children:[(0,cS.jsx)("div",{className:nb("header"),children:(0,cS.jsx)(mL,{hidePlugins:J})}),(0,cS.jsx)("div",{className:nb("nav"),children:(0,cS.jsx)(m8,{items:N,mobileActions:o&&"toggle"===P&&(0,cS.jsx)(cP.IconButton,{type:"button",title:R?T:S,onClick:()=>{G({mobilePanelExpanded:!R})},children:R?(0,cS.jsx)(cP.Minimize2,{size:21}):(0,cS.jsx)(cP.Maximize2,{size:21})})})}),(0,cS.jsx)(m3,{position:"left",sidebarRef:t,isVisible:o,onResize:s,onResizeEnd:u,children:Object.entries(N).map(([a,{mobileOnly:b,render:c,label:d}])=>(0,cS.jsx)(nf,{visible:H===a,mobileOnly:b,children:(0,cS.jsx)(c,{})},a))}),(0,cS.jsx)(m$,{}),!Q&&(0,cS.jsx)(m3,{position:"right",sidebarRef:y,isVisible:p,onResize:w,onResizeEnd:z,children:(0,cS.jsx)(ne,{})})]})})})})}),(0,cS.jsx)("div",{id:"puck-portal-root",className:na("portal")})]})},nh=(0,cv.createContext)({});function ni(a){return(0,cS.jsx)(nh.Provider,{value:a,children:a.children})}var nj=()=>(0,cv.useContext)(nh);function nk({children:a}){let{config:b,data:c,ui:d,onChange:e,permissions:f={},plugins:g,overrides:h,viewports:i=cz.defaultViewports,iframe:j,dnd:k,initialHistory:l,metadata:m,dictionary:n,onAction:o,fieldTransforms:p,_experimentalFullScreenCanvas:q,_experimentalVirtualization:r}=nj(),s=(0,cv.useMemo)(()=>m9(j),[j]),[t]=(0,cv.useState)(()=>{var a,e,f;let g=(0,cR.__spreadValues)((0,cR.__spreadValues)({},cz.defaultAppState.ui),d);!(Object.keys((null==c?void 0:c.root)||{}).length>0)||(null==(a=null==c?void 0:c.root)?void 0:a.props)||console.warn("Warning: Defining props on `root` is deprecated. Please use `root.props`, or republish this page to migrate automatically.");let h=(null==(e=null==c?void 0:c.root)?void 0:e.props)||(null==c?void 0:c.root)||{},i=(0,cR.__spreadValues)((0,cR.__spreadValues)({},null==(f=b.root)?void 0:f.defaultProps),h),j=(0,cQ.populateIds)((0,cB.toComponent)((0,cR.__spreadProps)((0,cR.__spreadValues)({},null==c?void 0:c.root),{props:i})),b),k=(0,cR.__spreadProps)((0,cR.__spreadValues)({},cz.defaultAppState),{data:(0,cR.__spreadProps)((0,cR.__spreadValues)({},c),{root:(0,cR.__spreadProps)((0,cR.__spreadValues)({},null==c?void 0:c.root),{props:j.props}),content:c.content||[]}),ui:(0,cR.__spreadProps)((0,cR.__spreadValues)((0,cR.__spreadValues)({},g),{}),{componentList:b.categories?Object.entries(b.categories).reduce((a,[b,c])=>(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{[b]:{title:c.title,components:c.components,expanded:c.defaultExpanded,visible:c.visible}}),{}):{}})});return(0,cB.walkAppState)(k,b)}),{appendData:u=!0}=l||{},[v]=(0,cv.useState)([...(null==l?void 0:l.histories)||[],...u?[{state:t}]:[]].map(a=>{let c=(0,cR.__spreadValues)((0,cR.__spreadValues)({},t),a.state);return a.state.indexes||(c=(0,cB.walkAppState)(c,b)),(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{state:c})})),w=(0,cv.useMemo)(()=>(null==l?void 0:l.index)!==void 0&&(null==l?void 0:l.index)>=0&&(null==l?void 0:l.index)<v.length?null==l?void 0:l.index:v.length-1,[]),y=v[w].state,z=(({overrides:a,plugins:b})=>(0,cv.useMemo)(()=>(({overrides:a,plugins:b})=>{let c=(0,cR.__spreadValues)({},a);return null==b||b.forEach(a=>{a.overrides&&Object.keys(a.overrides).forEach(b=>{var d;if(!(null==(d=a.overrides)?void 0:d[b]))return;if("fieldTypes"===b){let b=a.overrides.fieldTypes;Object.keys(b).forEach(a=>{c.fieldTypes=c.fieldTypes||{};let d=c.fieldTypes[a];c.fieldTypes[a]=c=>b[a]((0,cR.__spreadProps)((0,cR.__spreadValues)({},c),{children:d?d(c):c.children}))});return}let e=c[b];c[b]=c=>a.overrides[b]((0,cR.__spreadProps)((0,cR.__spreadValues)({},c),{children:e?e(c):c.children}))})}),c})({overrides:a,plugins:b}),[b,a]))({overrides:h,plugins:g}),A=(0,cv.useMemo)(()=>{let a=(g||[]).reduce((a,b)=>(0,cR.__spreadValues)((0,cR.__spreadValues)({},a),b.fieldTransforms),{});return(0,cR.__spreadValues)((0,cR.__spreadValues)({},a),p)},[p,g]),B=j9(),C=(0,cv.useCallback)(a=>({instanceId:B,state:a,config:b,plugins:g||[],overrides:z,viewports:i,iframe:s,_experimentalFullScreenCanvas:!!q,_experimentalVirtualization:!!r,onAction:o,metadata:m,dictionary:n||{},dnd:k,fieldTransforms:A}),[B,y,b,g,z,i,s,q,r,o,m,n,k,A]),[D]=(0,cv.useState)(()=>(0,cP.createAppStore)(C(y)));(0,cv.useEffect)(()=>{},[D]),(0,cv.useEffect)(()=>{let a=D.getState().state;D.setState((0,cR.__spreadValues)({},C(a)))},[C]),(0,cP.useRegisterHistorySlice)(D,{histories:v,index:w,initialAppState:y});let E=(0,cv.useRef)(null);(0,cv.useEffect)(()=>D.subscribe(a=>a.state.data,a=>{e&&((0,iV.deepEqual)(a,E.current)||(e(a),E.current=a))}),[e]),(0,cP.useRegisterPermissionsSlice)(D,f);let F=(a=>{let[b]=(0,cv.useState)(()=>(0,cV.createStore)(()=>lo(lq(a.getState()),a.getState)));return(0,cv.useEffect)(()=>a.subscribe(a=>lq(a),c=>{b.setState(lo(c,a.getState))}),[]),b})(D);return(0,cv.useEffect)(()=>{let{resolveAndCommitData:a}=D.getState();setTimeout(()=>{a()},0)},[]),(0,cS.jsx)(cP.appStoreContext.Provider,{value:D,children:(0,cS.jsx)(lp.Provider,{value:F,children:a})})}function nl(a){return(0,cS.jsx)(ni,(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{children:(0,cS.jsx)(nk,(0,cR.__spreadProps)((0,cR.__spreadValues)({},a),{children:(0,cS.jsx)(ng,{children:a.children})}))}))}function nm(a){return a.main?"main":a.header?"header":a.footer?"footer":a.announcement?"announcement":a.cta?"cta":Object.keys(a)[0]??"main"}nl.Components=lu,nl.Fields=mi,nl.Layout=ng,nl.Outline=ma,nl.Preview=mF,(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),(0,cR.init_react_import)(),a.i(527250),a.i(437692),a.i(104228),(0,cC.init_react_import)();let nn={id:"puck",version:"1.0.0",toEditor(a){let b=nm(a.slots);return{content:(a.slots[b]??[]).map(a=>({type:a.component,props:{...a.props,id:a.id}})),root:{props:{}}}},fromEditor(a,b){let c=structuredClone(a),d=nm(c.slots),e=new Set;return c.slots[d]=b.content.map(b=>{let c=String(b.props.id);if(!c||"undefined"===c||e.has(c))throw Error("Editor block ids must be unique.");e.add(c);let f=a.slots[d]?.find(a=>a.id===c),g={...b.props};return delete g.id,{...f,id:c,component:b.type,componentVersion:f?.component===b.type?f.componentVersion:1,props:g}}),c}};function no(a){let b=(0,cu.resolveTheme)(a.themeId),c=a.slot??"main";return{version:1,siteId:a.siteId,theme:{id:b.id,version:b.version},template:{id:"layout",version:"1.0.0"},surface:"layout",slots:{[c]:a.blocks}}}function np(a,b){let c=nn.fromEditor(no(a),b);return{...a,blocks:c.slots[a.slot??"main"]??[],revision:a.revision+1}}function nq({value:a,onChange:b,kind:c,layoutId:d}){let[e,f]=(0,cv.useState)([]);return(0,cv.useEffect)(()=>{fetch(`/api/layouts/${d}/choices?kind=${c}`).then(a=>a.ok?a.json():{options:[]}).then(a=>f(Array.isArray(a.options)?a.options:[]))},[c,d]),(0,ct.jsxs)("select",{"aria-label":"media"===c?"Choose media from library":"Choose internal destination",value:a?.id??"",onChange:a=>b(e.find(b=>b.id===a.target.value)),children:[(0,ct.jsx)("option",{value:"",children:"Choose…"}),e.map(a=>(0,ct.jsx)("option",{value:a.id,children:a.label},a.id))]})}function nr({value:a,onChange:b}){let c={collection:"content",limit:6,sort:"newest",...a};return(0,ct.jsxs)("fieldset",{"aria-label":"Content query",style:{display:"grid",gap:8},children:[(0,ct.jsxs)("select",{value:String(c.collection),onChange:a=>b({...c,collection:a.target.value}),children:[(0,ct.jsx)("option",{value:"content",children:"Articles and pages"}),(0,ct.jsx)("option",{value:"events",children:"Events"}),(0,ct.jsx)("option",{value:"albums",children:"Albums"}),(0,ct.jsx)("option",{value:"discussions",children:"Discussions"})]}),(0,ct.jsxs)("select",{value:String(c.sort),onChange:a=>b({...c,sort:a.target.value}),children:[(0,ct.jsx)("option",{value:"newest",children:"Newest first"}),(0,ct.jsx)("option",{value:"oldest",children:"Oldest first"}),(0,ct.jsx)("option",{value:"title",children:"Title"})]}),(0,ct.jsx)("input",{"aria-label":"Maximum results",type:"number",min:1,max:24,value:Number(c.limit),onChange:a=>b({...c,limit:Number(a.target.value)})})]})}function ns({layout:a,onChange:b,onPublish:c}){let{id:d,siteId:e,themeId:f,slot:g="main"}=a,h=(0,cv.useMemo)(()=>{let a=(0,cu.resolveTheme)(f),b=function(a){let b=(0,cu.resolveTheme)(a.theme.id),c=(0,cu.resolveTemplate)(b,a.surface,a.template.id),d=nm(a.slots),e=new Set(c.slots[d]?.allowedComponents??[]),f=new Map;for(let a of Object.values(b.componentRegistry)){if(!e.has(a.id)||"publisher.editorial"===a.id)continue;let b=f.get(a.category)??[];b.push(a.id),f.set(a.category,b)}return[...f.entries()].map(([a,b])=>({id:a.toLowerCase().replaceAll(/[^a-z0-9]+/g,"-"),label:a,components:b}))}({version:1,siteId:e,theme:{id:a.id,version:a.version},template:{id:"layout",version:"1.0.0"},surface:"layout",slots:{[g]:[]}}),c=new Set(b.flatMap(a=>a.components));return{categories:Object.fromEntries(b.map(a=>[a.id,{title:a.label,components:a.components,defaultExpanded:"introduction"===a.id}])),components:Object.fromEntries(Object.values(a.componentRegistry).filter(a=>c.has(a.id)).map(a=>[a.id,{label:a.label,fields:Object.fromEntries(Object.entries(a.fields).map(([a,b])=>[a,"text"===b.type?{type:"text",label:b.label}:"long-text"===b.type?{type:"textarea",label:b.label}:"number"===b.type?{type:"number",label:b.label,min:b.min,max:b.max}:"boolean"===b.type?{type:"radio",label:b.label,options:[{label:"Yes",value:!0},{label:"No",value:!1}]}:"select"===b.type||"alignment"===b.type||"token"===b.type?{type:"select",label:b.label,options:b.options.map(a=>({label:a,value:a}))}:"content-query"===b.type?{type:"custom",label:b.label,render:({value:a,onChange:b})=>(0,ct.jsx)(nr,{value:a,onChange:b})}:{type:"custom",label:b.label,render:({value:a,onChange:c})=>(0,ct.jsx)(nq,{value:a,onChange:c,kind:b.type,layoutId:d})}])),defaultProps:{title:a.label,alignment:"left",spacing:"normal",variant:"default"},render:b=>a.render(b)}]))}},[d,e,f,g]);return(0,ct.jsx)(nl,{config:h,data:nn.toEditor(no(a)),permissions:{drag:!0,duplicate:!0,delete:!0,edit:!0,insert:!0},onChange:c=>b(np(a,c)),onPublish:b=>c(np(a,b)),headerTitle:"Renegade visual editor",headerPath:`${a.surface??"page"} / ${a.slot??"main"}`},`${a.id}:${a.themeId}:${a.slot??"main"}`)}function nt(a){return{version:Number(a.layoutVersion??1),id:String(a.id),siteId:"string"==typeof a.site?a.site:String(a.site?.id??""),spaceId:"string"==typeof a.space?a.space:void 0,name:"string"==typeof a.name?a.name:void 0,path:String(a.path),status:"published"===a.status?"published":"draft",themeId:(0,cu.resolveTheme)(String(a.themeId??"")).id,surface:a.surface??"page",slot:"header"===a.slot||"footer"===a.slot||"announcement"===a.slot||"cta"===a.slot?a.slot:"main",templateId:"string"==typeof a.templateId?a.templateId:void 0,templateVersion:"number"==typeof a.templateVersion?a.templateVersion:void 0,templateMode:a.templateMode,isRetired:!0===a.isRetired,category:"string"==typeof a.category?a.category:void 0,blocks:Array.isArray(a.blocks)?a.blocks:[],unknownBlocks:Array.isArray(a.unknownBlocks)?a.unknownBlocks:[],revision:Number(a.revision??1),publishedRevision:"number"==typeof a.publishedRevision?a.publishedRevision:void 0}}a.s(["BuilderShell",0,function({layoutId:a}){let[b,c]=(0,cv.useState)(null),[d,e]=(0,cv.useState)("Loading draft canvas…"),[f,g]=(0,cv.useState)(!1),[h,i]=(0,cv.useState)(!1),[j,k]=(0,cv.useState)(null),[l,m]=(0,cv.useState)(0),[n,o]=(0,cv.useState)("canvas"),[p,q]=(0,cv.useState)(null),[r,s]=(0,cv.useState)("desktop"),[t,u]=(0,cv.useState)(""),[v,w]=(0,cv.useState)(""),[y,z]=(0,cv.useState)(""),[A,B]=(0,cv.useState)(""),[C,D]=(0,cv.useState)(""),[E,F]=(0,cv.useState)("inherited"),G=(0,cv.useCallback)(a=>{fetch(`/api/layouts/overview?siteId=${encodeURIComponent(a)}`).then(a=>a.ok?a.json():null).then(a=>{a&&q(a)}).catch(()=>{})},[]);(0,cv.useEffect)(()=>{fetch(`/api/page-layouts/${a}`).then(a=>a.ok?a.json():Promise.reject()).then(nt).then(a=>{c(a),m(a.revision),i(!1),e("Draft changes stay private until explicitly published."),a.siteId&&G(a.siteId)}).catch(()=>e("You do not have access to this layout or it is unavailable."))},[a,G]);let H=(0,cv.useCallback)(async(a,b=!1)=>{g(!0),c(a);try{let d=await fetch(`/api/layouts/${a.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({layout:a,publish:b,expectedRevision:l})}),f=await d.json();if(409===d.status&&f.current){window.sessionStorage.setItem(`renegade-layout-recovery:${a.id}`,JSON.stringify(a)),k(nt(f.current)),e("A newer server draft exists. Your local work is preserved for recovery.");return}if(d.ok&&f.layout){let a=nt(f.layout);c(a),m(a.revision),i(!1),a.siteId&&G(a.siteId)}e(d.ok?b?"🎉 Published successfully! Live for all visitors.":"💾 Draft saved locally to database.":"Could not save this layout. Verify permissions.")}catch{e("Network error while saving layout.")}finally{g(!1)}},[l,G]);(0,cv.useEffect)(()=>{if(!b||!h||f||j)return;let a=window.setTimeout(()=>void H(b,!1),1200);return()=>window.clearTimeout(a)},[b,h,f,j,H]);let I=async()=>{if(b&&t.trim()){g(!0);try{(await fetch("/api/layouts/patterns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"save",siteId:b.siteId,name:t.trim(),themeId:b.themeId,blocks:b.blocks})})).ok?(e(`Pattern "${t}" saved!`),u(""),G(b.siteId),o("patterns")):e("Failed to save pattern.")}catch{e("Error saving pattern.")}finally{g(!1)}}},J=async(a,d)=>{if(b){g(!0);try{let f=await fetch("/api/layouts/patterns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"instantiate",siteId:b.siteId,patternId:a,mode:d})}),g=await f.json();if(f.ok&&Array.isArray(g.blocks)){let a=[...b.blocks,...g.blocks],f={...b,blocks:a,revision:b.revision+1};c(f),i(!0),o("canvas"),e(`Pattern inserted as ${d}.`)}}catch{e("Error inserting pattern.")}finally{g(!1)}}},K=async()=>{if(b&&"number"==typeof v){g(!0);try{let a=await fetch(`/api/layouts/${b.id}/rollback`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetRevision:v})}),d=await a.json();if(a.ok&&d.layout){let a=nt(d.layout);c(a),m(a.revision),i(!1),e(`Rolled back to revision ${v}.`),w(""),o("canvas")}else e(d.error??"Rollback failed.")}catch{e("Error during rollback.")}finally{g(!1)}}},L=async()=>{if(b&&y&&A&&C){g(!0);try{let a=await fetch("/api/layouts/templates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create-page",siteId:b.siteId,path:y.startsWith("/")?y:`/${y}`,name:A,templateId:C,templateMode:E})}),c=await a.json();a.ok&&c.page?(e(`Page "${A}" created from template!`),z(""),B(""),G(b.siteId),o("pages")):e(c.error??"Failed to create page.")}catch{e("Error creating page from template.")}finally{g(!1)}}},M=async a=>{if(b){g(!0);try{(await fetch("/api/layouts/templates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"retire",siteId:b.siteId,templateId:a})})).ok&&(e("Template retired."),G(b.siteId))}finally{g(!1)}}};return b?(0,ct.jsxs)("main",{className:"min-h-screen flex flex-col bg-stone-100 dark:bg-stone-950",children:[(0,ct.jsxs)("div",{className:"glass-panel border-b border-stone-200 dark:border-stone-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-16 z-40",children:[(0,ct.jsxs)("div",{className:"flex items-center gap-4",children:[(0,ct.jsx)(cw.default,{href:"/",className:"text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100",children:"← Back"}),(0,ct.jsxs)("div",{className:"flex items-center gap-2",children:[(0,ct.jsx)("span",{className:"font-bold text-sm text-stone-900 dark:text-stone-100",children:b.name||b.path}),(0,ct.jsx)("span",{className:`badge text-[10px] ${"published"===b.status?"badge-brand":"badge-neutral"}`,children:b.status}),(0,ct.jsxs)("span",{className:"badge badge-neutral text-[10px] capitalize",children:[b.surface??"page"," : ",b.slot??"main"]}),(0,ct.jsxs)("span",{className:"font-mono text-xs text-stone-500",children:["Rev #",b.revision]})]})]}),(0,ct.jsxs)("div",{"data-testid":"studio-navigator",className:"flex items-center gap-1 bg-stone-200 dark:bg-stone-800 p-1 rounded-xl text-xs",children:[(0,ct.jsx)("button",{type:"button",onClick:()=>o("canvas"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"canvas"===n?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:"Canvas"}),(0,ct.jsxs)("button",{type:"button",onClick:()=>o("pages"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"pages"===n?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:["Pages ",p?.pages?`(${p.pages.length})`:""]}),(0,ct.jsxs)("button",{type:"button",onClick:()=>o("templates"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"templates"===n?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:["Templates ",p?.templates?`(${p.templates.length})`:""]}),(0,ct.jsxs)("button",{type:"button",onClick:()=>o("globals"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"globals"===n?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:["Globals ",p?.globals?`(${p.globals.length})`:""]}),(0,ct.jsxs)("button",{type:"button",onClick:()=>o("patterns"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"patterns"===n?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:["Patterns ",p?.patterns?`(${p.patterns.length})`:""]})]}),(0,ct.jsxs)("div",{className:"flex items-center gap-3",children:[(0,ct.jsxs)("label",{className:"text-xs flex items-center gap-1",children:[(0,ct.jsx)("span",{className:"text-stone-500",children:"Theme:"}),(0,ct.jsxs)("select",{"aria-label":"Compatible theme",value:b.themeId,onChange:a=>{c({...b,themeId:(0,cu.resolveTheme)(a.target.value).id,revision:b.revision+1}),i(!0)},className:"text-xs bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded px-2 py-1",children:[(0,ct.jsx)("option",{value:"neutral-starter",children:"Neutral Starter"}),(0,ct.jsx)("option",{value:"renegade-party",children:"Renegade Party"})]})]}),(0,ct.jsxs)("div",{className:"flex items-center gap-1 border border-stone-300 dark:border-stone-700 rounded-lg p-0.5 bg-white dark:bg-stone-900",children:[(0,ct.jsx)("button",{type:"button","aria-label":"Desktop preview",onClick:()=>s("desktop"),className:`px-2 py-0.5 text-[10px] rounded ${"desktop"===r?"bg-stone-200 dark:bg-stone-800 font-bold":""}`,children:"Desktop"}),(0,ct.jsx)("button",{type:"button","aria-label":"Tablet preview",onClick:()=>s("tablet"),className:`px-2 py-0.5 text-[10px] rounded ${"tablet"===r?"bg-stone-200 dark:bg-stone-800 font-bold":""}`,children:"Tablet"}),(0,ct.jsx)("button",{type:"button","aria-label":"Mobile preview",onClick:()=>s("mobile"),className:`px-2 py-0.5 text-[10px] rounded ${"mobile"===r?"bg-stone-200 dark:bg-stone-800 font-bold":""}`,children:"Mobile"})]}),(0,ct.jsxs)(cw.default,{href:`/builder/${b.id}/preview?viewport=${r}`,target:"_blank",className:"btn btn-secondary text-xs px-3 py-1.5",children:["Exact Preview (",r,")"]}),(0,ct.jsx)("span",{className:"text-xs text-stone-600 dark:text-stone-400 hidden sm:inline-block font-mono",children:d}),(0,ct.jsx)("button",{type:"button",disabled:f,onClick:()=>void H(b,!1),className:"btn btn-secondary text-xs px-3.5 py-1.5",children:f?"Saving...":"Save Draft"}),(0,ct.jsx)("button",{type:"button",disabled:f,onClick:()=>void H(b,!0),className:"btn btn-primary text-xs px-4 py-1.5",children:f?"Publishing...":"Publish Live"})]})]}),j?(0,ct.jsxs)("div",{role:"alert",className:"border-b border-amber-300 bg-amber-50 px-6 py-3 text-sm text-amber-950 flex items-center justify-between",children:[(0,ct.jsxs)("span",{children:["Save conflict: server revision ",j.revision," is newer. Your draft is stored in this browser session."]}),(0,ct.jsx)("button",{type:"button",className:"underline font-medium",onClick:()=>{c(j),m(j.revision),k(null),i(!1)},children:"Reload server version"})]}):null,(b.unknownBlocks?.length??0)>0?(0,ct.jsxs)("div",{role:"status",className:"border-b border-rose-300 bg-rose-50 px-6 py-3 text-sm text-rose-950",children:["Repair required: ",b.unknownBlocks?.length," section(s) use removed or incompatible components. Their data is preserved and public rendering uses a safe unavailable-section fallback."]}):null,"pages"===n?(0,ct.jsxs)("div",{className:"max-w-5xl mx-auto w-full p-8 space-y-6",children:[(0,ct.jsxs)("div",{className:"flex items-center justify-between",children:[(0,ct.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:"Site Pages"}),(0,ct.jsx)("button",{type:"button",onClick:()=>o("canvas"),className:"btn btn-secondary text-xs",children:"Back to Canvas"})]}),(0,ct.jsx)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm",children:(0,ct.jsxs)("table",{className:"w-full text-left text-xs",children:[(0,ct.jsx)("thead",{className:"bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700",children:(0,ct.jsxs)("tr",{children:[(0,ct.jsx)("th",{className:"p-4",children:"Path"}),(0,ct.jsx)("th",{className:"p-4",children:"Title / Name"}),(0,ct.jsx)("th",{className:"p-4",children:"Status"}),(0,ct.jsx)("th",{className:"p-4",children:"Template Mode"}),(0,ct.jsx)("th",{className:"p-4",children:"Revision"}),(0,ct.jsx)("th",{className:"p-4 text-right",children:"Actions"})]})}),(0,ct.jsx)("tbody",{className:"divide-y divide-stone-100 dark:divide-stone-800",children:p?.pages.map(a=>(0,ct.jsxs)("tr",{className:"hover:bg-stone-50/50 dark:hover:bg-stone-800/50",children:[(0,ct.jsx)("td",{className:"p-4 font-mono font-medium",children:a.path}),(0,ct.jsx)("td",{className:"p-4",children:a.name||"—"}),(0,ct.jsx)("td",{className:"p-4",children:(0,ct.jsx)("span",{className:`badge text-[10px] ${"published"===a.status?"badge-brand":"badge-neutral"}`,children:a.status})}),(0,ct.jsx)("td",{className:"p-4",children:a.templateId?(0,ct.jsxs)("span",{className:"badge badge-neutral text-[10px] capitalize",children:[a.templateMode||"inherited"," (v",a.templateVersion??1,")"]}):(0,ct.jsx)("span",{className:"text-stone-400",children:"—"})}),(0,ct.jsxs)("td",{className:"p-4 font-mono",children:["#",a.revision]}),(0,ct.jsxs)("td",{className:"p-4 text-right space-x-2",children:[(0,ct.jsx)("a",{href:`/builder/${a.id}`,className:"btn btn-secondary btn-xs",children:"Open"}),(0,ct.jsx)("a",{href:`/builder/${a.id}/preview`,target:"_blank",className:"btn btn-secondary btn-xs",children:"Preview"})]})]},a.id))})]})})]}):null,"templates"===n?(0,ct.jsxs)("div",{className:"max-w-5xl mx-auto w-full p-8 space-y-6",children:[(0,ct.jsxs)("div",{className:"flex items-center justify-between",children:[(0,ct.jsxs)("div",{children:[(0,ct.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:"Reusable Page Templates"}),(0,ct.jsx)("p",{className:"text-xs text-stone-500",children:"Create new pages from templates with inherited, explicit, or detached composition."})]}),(0,ct.jsx)("button",{type:"button",onClick:()=>o("canvas"),className:"btn btn-secondary text-xs",children:"Back to Canvas"})]}),(0,ct.jsxs)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4",children:[(0,ct.jsx)("h3",{className:"text-sm font-bold text-stone-900 dark:text-stone-100",children:"Create New Page From Template"}),(0,ct.jsxs)("div",{className:"grid grid-cols-1 sm:grid-cols-4 gap-4",children:[(0,ct.jsx)("input",{type:"text",placeholder:"Page Title (e.g. Schedule)",value:A,onChange:a=>B(a.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent"}),(0,ct.jsx)("input",{type:"text",placeholder:"Path (e.g. /schedule)",value:y,onChange:a=>z(a.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent"}),(0,ct.jsxs)("select",{value:C,onChange:a=>D(a.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent",children:[(0,ct.jsx)("option",{value:"",children:"Select Template…"}),p?.templates.filter(a=>!a.isRetired).map(a=>(0,ct.jsxs)("option",{value:a.id,children:[a.name," (v",a.revision,")"]},a.id))]}),(0,ct.jsxs)("select",{value:E,onChange:a=>F(a.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent",children:[(0,ct.jsx)("option",{value:"inherited",children:"Inherited (Draft syncs)"}),(0,ct.jsx)("option",{value:"explicit",children:"Explicitly applied"}),(0,ct.jsx)("option",{value:"detached",children:"Detached (One-time clone)"})]})]}),(0,ct.jsx)("button",{type:"button",disabled:f||!A||!y||!C,onClick:()=>void L(),className:"btn btn-primary text-xs",children:"Create Page"})]}),(0,ct.jsx)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm",children:(0,ct.jsxs)("table",{className:"w-full text-left text-xs",children:[(0,ct.jsx)("thead",{className:"bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700",children:(0,ct.jsxs)("tr",{children:[(0,ct.jsx)("th",{className:"p-4",children:"Name"}),(0,ct.jsx)("th",{className:"p-4",children:"Category"}),(0,ct.jsx)("th",{className:"p-4",children:"Status"}),(0,ct.jsx)("th",{className:"p-4",children:"Version"}),(0,ct.jsx)("th",{className:"p-4",children:"Used By"}),(0,ct.jsx)("th",{className:"p-4 text-right",children:"Actions"})]})}),(0,ct.jsx)("tbody",{className:"divide-y divide-stone-100 dark:divide-stone-800",children:p?.templates.map(a=>(0,ct.jsxs)("tr",{className:"hover:bg-stone-50/50 dark:hover:bg-stone-800/50",children:[(0,ct.jsx)("td",{className:"p-4 font-medium",children:a.name}),(0,ct.jsx)("td",{className:"p-4",children:a.category}),(0,ct.jsx)("td",{className:"p-4",children:a.isRetired?(0,ct.jsx)("span",{className:"badge badge-error text-[10px]",children:"Retired"}):(0,ct.jsx)("span",{className:"badge badge-brand text-[10px]",children:"Active"})}),(0,ct.jsxs)("td",{className:"p-4 font-mono",children:["v",a.revision]}),(0,ct.jsxs)("td",{className:"p-4 font-mono",children:[a.usageCount," page(s)"]}),(0,ct.jsxs)("td",{className:"p-4 text-right space-x-2",children:[(0,ct.jsx)("a",{href:`/builder/${a.id}`,className:"btn btn-secondary btn-xs",children:"Edit"}),a.isRetired?null:(0,ct.jsx)("button",{type:"button",onClick:()=>void M(a.id),className:"btn btn-secondary btn-xs",children:"Retire"})]})]},a.id))})]})})]}):null,"globals"===n?(0,ct.jsxs)("div",{className:"max-w-5xl mx-auto w-full p-8 space-y-6",children:[(0,ct.jsxs)("div",{className:"flex items-center justify-between",children:[(0,ct.jsxs)("div",{children:[(0,ct.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:"Global Regions"}),(0,ct.jsx)("p",{className:"text-xs text-stone-500",children:"Manage site-wide headers, footers, announcements, and call-to-actions with rollback."})]}),(0,ct.jsx)("button",{type:"button",onClick:()=>o("canvas"),className:"btn btn-secondary text-xs",children:"Back to Canvas"})]}),(0,ct.jsx)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm",children:(0,ct.jsxs)("table",{className:"w-full text-left text-xs",children:[(0,ct.jsx)("thead",{className:"bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700",children:(0,ct.jsxs)("tr",{children:[(0,ct.jsx)("th",{className:"p-4",children:"Region"}),(0,ct.jsx)("th",{className:"p-4",children:"Slot"}),(0,ct.jsx)("th",{className:"p-4",children:"Status"}),(0,ct.jsx)("th",{className:"p-4",children:"Revision"}),(0,ct.jsx)("th",{className:"p-4 text-right",children:"Actions"})]})}),(0,ct.jsx)("tbody",{className:"divide-y divide-stone-100 dark:divide-stone-800",children:p?.globals.map(a=>(0,ct.jsxs)("tr",{className:"hover:bg-stone-50/50 dark:hover:bg-stone-800/50",children:[(0,ct.jsx)("td",{className:"p-4 font-medium",children:a.name}),(0,ct.jsx)("td",{className:"p-4 font-mono uppercase",children:a.slot}),(0,ct.jsx)("td",{className:"p-4",children:(0,ct.jsx)("span",{className:`badge text-[10px] ${"published"===a.status?"badge-brand":"badge-neutral"}`,children:a.status})}),(0,ct.jsxs)("td",{className:"p-4 font-mono",children:["#",a.revision]}),(0,ct.jsxs)("td",{className:"p-4 text-right space-x-2",children:[(0,ct.jsx)("a",{href:`/builder/${a.id}`,className:"btn btn-secondary btn-xs",children:"Edit"}),(0,ct.jsx)("a",{href:`/builder/${a.id}/preview`,target:"_blank",className:"btn btn-secondary btn-xs",children:"Preview"})]})]},a.id))})]})}),(0,ct.jsxs)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4",children:[(0,ct.jsx)("h3",{className:"text-sm font-bold text-stone-900 dark:text-stone-100",children:"Rollback Current Document"}),(0,ct.jsx)("p",{className:"text-xs text-stone-500",children:"Restore this layout to a previous revision number from its audit trail."}),(0,ct.jsxs)("div",{className:"flex items-center gap-3",children:[(0,ct.jsx)("input",{type:"number",min:1,max:b.revision-1,placeholder:"Target Revision Number",value:v,onChange:a=>w(a.target.value?Number(a.target.value):""),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent w-48"}),(0,ct.jsx)("button",{type:"button",disabled:f||"number"!=typeof v,onClick:()=>void K(),className:"btn btn-secondary text-xs",children:"Rollback Revision"})]})]})]}):null,"patterns"===n?(0,ct.jsxs)("div",{className:"max-w-5xl mx-auto w-full p-8 space-y-6",children:[(0,ct.jsxs)("div",{className:"flex items-center justify-between",children:[(0,ct.jsxs)("div",{children:[(0,ct.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:"Reusable Patterns"}),(0,ct.jsx)("p",{className:"text-xs text-stone-500",children:"Insert saved component trees into your layout as independent snapshots or linked instances."})]}),(0,ct.jsx)("button",{type:"button",onClick:()=>o("canvas"),className:"btn btn-secondary text-xs",children:"Back to Canvas"})]}),(0,ct.jsxs)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4",children:[(0,ct.jsx)("h3",{className:"text-sm font-bold text-stone-900 dark:text-stone-100",children:"Save Current Canvas as Reusable Pattern"}),(0,ct.jsxs)("div",{className:"flex items-center gap-3",children:[(0,ct.jsx)("input",{type:"text",placeholder:"Pattern Name (e.g. Callout + Features)",value:t,onChange:a=>u(a.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent flex-1 max-w-sm"}),(0,ct.jsx)("button",{type:"button",disabled:f||!t.trim(),onClick:()=>void I(),className:"btn btn-primary text-xs",children:"Save as Pattern"})]})]}),(0,ct.jsxs)("div",{className:"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",children:[p?.patterns.map(a=>(0,ct.jsxs)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 space-y-3 shadow-sm",children:[(0,ct.jsxs)("div",{className:"flex items-center justify-between",children:[(0,ct.jsx)("span",{className:"font-bold text-sm text-stone-900 dark:text-stone-100",children:a.name}),(0,ct.jsxs)("span",{className:"badge badge-neutral text-[10px]",children:["v",a.revision]})]}),(0,ct.jsxs)("p",{className:"text-xs text-stone-500",children:["Category: ",a.category]}),(0,ct.jsxs)("div",{className:"pt-2 flex items-center gap-2",children:[(0,ct.jsx)("button",{type:"button",onClick:()=>void J(a.id,"snapshot"),className:"btn btn-secondary text-xs flex-1",children:"Insert Snapshot"}),(0,ct.jsx)("button",{type:"button",onClick:()=>void J(a.id,"linked"),className:"btn btn-primary text-xs flex-1",children:"Insert Linked"})]})]},a.id)),(p?.patterns.length??0)===0?(0,ct.jsx)("p",{className:"text-xs text-stone-500 col-span-3",children:"No saved patterns yet. Save one above!"}):null]})]}):null,"canvas"===n?(0,ct.jsx)("div",{className:"flex-1",children:(0,ct.jsx)(ns,{layout:b,onChange:a=>{c(a),i(!0),e("Unsaved changes — autosaving…")},onPublish:a=>void H(a,!0)})}):null]}):(0,ct.jsxs)("main",{className:"max-w-4xl mx-auto px-6 py-24 text-center space-y-4",children:[(0,ct.jsx)("div",{className:"w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto text-xl",children:"🎨"}),(0,ct.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:d}),(0,ct.jsxs)("p",{className:"text-xs text-stone-500 font-mono",children:["Layout ID: ",a]}),(0,ct.jsx)("div",{className:"pt-4",children:(0,ct.jsx)(cw.default,{href:"/",className:"btn btn-secondary text-xs",children:"← Return to Home"})})]})}],476025)}];

//# sourceMappingURL=_14qg910._.js.map