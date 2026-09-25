(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,368971,(e,t,r)=>{t.exports=(function t(r,n,o){function i(l,s){if(!n[l]){if(!r[l]){var c=e.t;return!s&&c?c(l,!0):a(l,!0)}s=n[l]={exports:{}},r[l][0].call(s.exports,function(e){return i(r[l][1][e]||e)},s,s.exports,t,r,n,o)}return n[l].exports}for(var a=e.t,l=0;l<o.length;l++)i(o[l]);return i})({1:[function(e,t,r){(function(n,o,i,a,l,s,c,u,d){"use strict";var p=e("crypto");function h(e,t){var r;return void 0===(r="passthrough"!==(t=g(e,t)).algorithm?p.createHash(t.algorithm):new b).write&&(r.write=r.update,r.end=r.update),_(t,r).dispatch(e),r.update||r.end(""),r.digest?r.digest("buffer"===t.encoding?void 0:t.encoding):(e=r.read(),"buffer"!==t.encoding?e.toString(t.encoding):e)}(r=t.exports=h).sha1=function(e){return h(e)},r.keys=function(e){return h(e,{excludeValues:!0,algorithm:"sha1",encoding:"hex"})},r.MD5=function(e){return h(e,{algorithm:"md5",encoding:"hex"})},r.keysMD5=function(e){return h(e,{algorithm:"md5",encoding:"hex",excludeValues:!0})};var f=p.getHashes?p.getHashes().slice():["sha1","md5"],v=(f.push("passthrough"),["buffer","hex","binary","base64"]);function g(e,t){var r={};if(r.algorithm=(t=t||{}).algorithm||"sha1",r.encoding=t.encoding||"hex",r.excludeValues=!!t.excludeValues,r.algorithm=r.algorithm.toLowerCase(),r.encoding=r.encoding.toLowerCase(),r.ignoreUnknown=!0===t.ignoreUnknown,r.respectType=!1!==t.respectType,r.respectFunctionNames=!1!==t.respectFunctionNames,r.respectFunctionProperties=!1!==t.respectFunctionProperties,r.unorderedArrays=!0===t.unorderedArrays,r.unorderedSets=!1!==t.unorderedSets,r.unorderedObjects=!1!==t.unorderedObjects,r.replacer=t.replacer||void 0,r.excludeKeys=t.excludeKeys||void 0,void 0===e)throw Error("Object argument required.");for(var n=0;n<f.length;++n)f[n].toLowerCase()===r.algorithm.toLowerCase()&&(r.algorithm=f[n]);if(-1===f.indexOf(r.algorithm))throw Error('Algorithm "'+r.algorithm+'"  not supported. supported values: '+f.join(", "));if(-1===v.indexOf(r.encoding)&&"passthrough"!==r.algorithm)throw Error('Encoding "'+r.encoding+'"  not supported. supported values: '+v.join(", "));return r}function m(e){if("function"==typeof e)return null!=/^function\s+\w*\s*\(\s*\)\s*{\s+\[native code\]\s+}$/i.exec(Function.prototype.toString.call(e))}function _(e,t,r){function n(e){return t.update?t.update(e,"utf8"):t.write(e,"utf8")}return r=r||[],{dispatch:function(t){return this["_"+(null===(t=e.replacer?e.replacer(t):t)?"null":typeof t)](t)},_object:function(t){var o,a=Object.prototype.toString.call(t),l=/\[object (.*)\]/i.exec(a);if(l=(l=l?l[1]:"unknown:["+a+"]").toLowerCase(),0<=(a=r.indexOf(t)))return this.dispatch("[CIRCULAR:"+a+"]");if(r.push(t),void 0!==i&&i.isBuffer&&i.isBuffer(t))return n("buffer:"),n(t);if("object"===l||"function"===l||"asyncfunction"===l)return a=Object.keys(t),e.unorderedObjects&&(a=a.sort()),!1===e.respectType||m(t)||a.splice(0,0,"prototype","__proto__","constructor"),e.excludeKeys&&(a=a.filter(function(t){return!e.excludeKeys(t)})),n("object:"+a.length+":"),o=this,a.forEach(function(r){o.dispatch(r),n(":"),e.excludeValues||o.dispatch(t[r]),n(",")});if(!this["_"+l]){if(e.ignoreUnknown)return n("["+l+"]");throw Error('Unknown object type "'+l+'"')}this["_"+l](t)},_array:function(t,o){o=void 0!==o?o:!1!==e.unorderedArrays;var i=this;if(n("array:"+t.length+":"),!o||t.length<=1)return t.forEach(function(e){return i.dispatch(e)});var a=[],o=t.map(function(t){var n=new b,o=r.slice();return _(e,n,o).dispatch(t),a=a.concat(o.slice(r.length)),n.read().toString()});return r=r.concat(a),o.sort(),this._array(o,!1)},_date:function(e){return n("date:"+e.toJSON())},_symbol:function(e){return n("symbol:"+e.toString())},_error:function(e){return n("error:"+e.toString())},_boolean:function(e){return n("bool:"+e.toString())},_string:function(e){n("string:"+e.length+":"),n(e.toString())},_function:function(t){n("fn:"),m(t)?this.dispatch("[native]"):this.dispatch(t.toString()),!1!==e.respectFunctionNames&&this.dispatch("function-name:"+String(t.name)),e.respectFunctionProperties&&this._object(t)},_number:function(e){return n("number:"+e.toString())},_xml:function(e){return n("xml:"+e.toString())},_null:function(){return n("Null")},_undefined:function(){return n("Undefined")},_regexp:function(e){return n("regex:"+e.toString())},_uint8array:function(e){return n("uint8array:"),this.dispatch(Array.prototype.slice.call(e))},_uint8clampedarray:function(e){return n("uint8clampedarray:"),this.dispatch(Array.prototype.slice.call(e))},_int8array:function(e){return n("int8array:"),this.dispatch(Array.prototype.slice.call(e))},_uint16array:function(e){return n("uint16array:"),this.dispatch(Array.prototype.slice.call(e))},_int16array:function(e){return n("int16array:"),this.dispatch(Array.prototype.slice.call(e))},_uint32array:function(e){return n("uint32array:"),this.dispatch(Array.prototype.slice.call(e))},_int32array:function(e){return n("int32array:"),this.dispatch(Array.prototype.slice.call(e))},_float32array:function(e){return n("float32array:"),this.dispatch(Array.prototype.slice.call(e))},_float64array:function(e){return n("float64array:"),this.dispatch(Array.prototype.slice.call(e))},_arraybuffer:function(e){return n("arraybuffer:"),this.dispatch(new Uint8Array(e))},_url:function(e){return n("url:"+e.toString())},_map:function(t){return n("map:"),t=Array.from(t),this._array(t,!1!==e.unorderedSets)},_set:function(t){return n("set:"),t=Array.from(t),this._array(t,!1!==e.unorderedSets)},_file:function(e){return n("file:"),this.dispatch([e.name,e.size,e.type,e.lastModfied])},_blob:function(){if(e.ignoreUnknown)return n("[blob]");throw Error('Hashing Blob objects is currently not supported\n(see https://github.com/puleos/object-hash/issues/26)\nUse "options.replacer" or "options.ignoreUnknown"\n')},_domwindow:function(){return n("domwindow")},_bigint:function(e){return n("bigint:"+e.toString())},_process:function(){return n("process")},_timer:function(){return n("timer")},_pipe:function(){return n("pipe")},_tcp:function(){return n("tcp")},_udp:function(){return n("udp")},_tty:function(){return n("tty")},_statwatcher:function(){return n("statwatcher")},_securecontext:function(){return n("securecontext")},_connection:function(){return n("connection")},_zlib:function(){return n("zlib")},_context:function(){return n("context")},_nodescript:function(){return n("nodescript")},_httpparser:function(){return n("httpparser")},_dataview:function(){return n("dataview")},_signal:function(){return n("signal")},_fsevent:function(){return n("fsevent")},_tlswrap:function(){return n("tlswrap")}}}function b(){return{buf:"",write:function(e){this.buf+=e},end:function(e){this.buf+=e},read:function(){return this.buf}}}r.writeToStream=function(e,t,r){return void 0===r&&(r=t,t={}),_(t=g(e,t),r).dispatch(e)}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_9a5aa49d.js","/")},{buffer:3,crypto:5,lYpoI2:11}],2:[function(e,t,r){(function(e,t,n,o,i,a,l,s,c){!function(e){"use strict";var t="u">typeof Uint8Array?Uint8Array:Array;function r(e){return 43===(e=e.charCodeAt(0))||45===e?62:47===e||95===e?63:e<48?-1:e<58?e-48+26+26:e<91?e-65:e<123?e-97+26:void 0}e.toByteArray=function(e){if(0<e.length%4)throw Error("Invalid string. Length must be a multiple of 4");var n,o,i=e.length,i="="===e.charAt(i-2)?2:+("="===e.charAt(i-1)),a=new t(3*e.length/4-i),l=0<i?e.length-4:e.length,s=0;function c(e){a[s++]=e}for(n=0;n<l;n+=4)c((0xff0000&(o=r(e.charAt(n))<<18|r(e.charAt(n+1))<<12|r(e.charAt(n+2))<<6|r(e.charAt(n+3))))>>16),c((65280&o)>>8),c(255&o);return 2==i?c(255&(o=r(e.charAt(n))<<2|r(e.charAt(n+1))>>4)):1==i&&(c((o=r(e.charAt(n))<<10|r(e.charAt(n+1))<<4|r(e.charAt(n+2))>>2)>>8&255),c(255&o)),a},e.fromByteArray=function(e){var t,r,n,o,i=e.length%3,a="";function l(e){return"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charAt(e)}for(t=0,n=e.length-i;t<n;t+=3)a+=l((o=r=(e[t]<<16)+(e[t+1]<<8)+e[t+2])>>18&63)+l(o>>12&63)+l(o>>6&63)+l(63&o);switch(i){case 1:a=(a+=l((r=e[e.length-1])>>2))+l(r<<4&63)+"==";break;case 2:a=(a=(a+=l((r=(e[e.length-2]<<8)+e[e.length-1])>>10))+l(r>>4&63))+l(r<<2&63)+"="}return a}}(void 0===r?this.base64js={}:r)}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/base64-js/lib/b64.js","/node_modules/gulp-browserify/node_modules/base64-js/lib")},{buffer:3,lYpoI2:11}],3:[function(e,t,r){(function(t,n,o,i,a,l,s,c,u){var d=e("base64-js"),p=e("ieee754");function o(e,t,r){if(!(this instanceof o))return new o(e,t,r);var n,i,a,l,s=typeof e;if("base64"===t&&"string"==s)for(e=(l=e).trim?l.trim():l.replace(/^\s+|\s+$/g,"");e.length%4!=0;)e+="=";if("number"==s)n=E(e);else if("string"==s)n=o.byteLength(e,t);else{if("object"!=s)throw Error("First argument needs to be a number, array or string.");n=E(e.length)}if(o._useTypedArrays?i=o._augment(new Uint8Array(n)):((i=this).length=n,i._isBuffer=!0),o._useTypedArrays&&"number"==typeof e.byteLength)i._set(e);else if(C(l=e)||o.isBuffer(l)||l&&"object"==typeof l&&"number"==typeof l.length)for(a=0;a<n;a++)o.isBuffer(e)?i[a]=e.readUInt8(a):i[a]=e[a];else if("string"==s)i.write(e,0,t);else if("number"==s&&!o._useTypedArrays&&!r)for(a=0;a<n;a++)i[a]=0;return i}function h(e,t,r,n){n||(B("boolean"==typeof r,"missing or invalid endian"),B(null!=t,"missing offset"),B(t+1<e.length,"Trying to read beyond buffer length"));var o,n=e.length;if(!(n<=t))return r?(o=e[t],t+1<n&&(o|=e[t+1]<<8)):(o=e[t]<<8,t+1<n&&(o|=e[t+1])),o}function f(e,t,r,n){n||(B("boolean"==typeof r,"missing or invalid endian"),B(null!=t,"missing offset"),B(t+3<e.length,"Trying to read beyond buffer length"));var o,n=e.length;if(!(n<=t))return r?(t+2<n&&(o=e[t+2]<<16),t+1<n&&(o|=e[t+1]<<8),o|=e[t],t+3<n&&(o+=e[t+3]<<24>>>0)):(t+1<n&&(o=e[t+1]<<16),t+2<n&&(o|=e[t+2]<<8),t+3<n&&(o|=e[t+3]),o+=e[t]<<24>>>0),o}function v(e,t,r,n){if(n||(B("boolean"==typeof r,"missing or invalid endian"),B(null!=t,"missing offset"),B(t+1<e.length,"Trying to read beyond buffer length")),!(e.length<=t))return 32768&(n=h(e,t,r,!0))?-1*(65535-n+1):n}function g(e,t,r,n){if(n||(B("boolean"==typeof r,"missing or invalid endian"),B(null!=t,"missing offset"),B(t+3<e.length,"Trying to read beyond buffer length")),!(e.length<=t))return 0x80000000&(n=f(e,t,r,!0))?-1*(0xffffffff-n+1):n}function m(e,t,r,n){return n||(B("boolean"==typeof r,"missing or invalid endian"),B(t+3<e.length,"Trying to read beyond buffer length")),p.read(e,t,r,23,4)}function _(e,t,r,n){return n||(B("boolean"==typeof r,"missing or invalid endian"),B(t+7<e.length,"Trying to read beyond buffer length")),p.read(e,t,r,52,8)}function b(e,t,r,n,o){if(o||(B(null!=t,"missing value"),B("boolean"==typeof n,"missing or invalid endian"),B(null!=r,"missing offset"),B(r+1<e.length,"trying to write beyond buffer length"),T(t,65535)),!((o=e.length)<=r))for(var i=0,a=Math.min(o-r,2);i<a;i++)e[r+i]=(t&255<<8*(n?i:1-i))>>>8*(n?i:1-i)}function y(e,t,r,n,o){if(o||(B(null!=t,"missing value"),B("boolean"==typeof n,"missing or invalid endian"),B(null!=r,"missing offset"),B(r+3<e.length,"trying to write beyond buffer length"),T(t,0xffffffff)),!((o=e.length)<=r))for(var i=0,a=Math.min(o-r,4);i<a;i++)e[r+i]=t>>>8*(n?i:3-i)&255}function k(e,t,r,n,o){o||(B(null!=t,"missing value"),B("boolean"==typeof n,"missing or invalid endian"),B(null!=r,"missing offset"),B(r+1<e.length,"Trying to write beyond buffer length"),N(t,32767,-32768)),e.length<=r||b(e,0<=t?t:65535+t+1,r,n,o)}function w(e,t,r,n,o){o||(B(null!=t,"missing value"),B("boolean"==typeof n,"missing or invalid endian"),B(null!=r,"missing offset"),B(r+3<e.length,"Trying to write beyond buffer length"),N(t,0x7fffffff,-0x80000000)),e.length<=r||y(e,0<=t?t:0xffffffff+t+1,r,n,o)}function S(e,t,r,n,o){o||(B(null!=t,"missing value"),B("boolean"==typeof n,"missing or invalid endian"),B(null!=r,"missing offset"),B(r+3<e.length,"Trying to write beyond buffer length"),L(t,34028234663852886e22,-34028234663852886e22)),e.length<=r||p.write(e,t,r,n,23,4)}function I(e,t,r,n,o){o||(B(null!=t,"missing value"),B("boolean"==typeof n,"missing or invalid endian"),B(null!=r,"missing offset"),B(r+7<e.length,"Trying to write beyond buffer length"),L(t,17976931348623157e292,-17976931348623157e292)),e.length<=r||p.write(e,t,r,n,52,8)}r.Buffer=o,r.SlowBuffer=o,r.INSPECT_MAX_BYTES=50,o.poolSize=8192,o._useTypedArrays=function(){try{var e=new ArrayBuffer(0),t=new Uint8Array(e);return t.foo=function(){return 42},42===t.foo()&&"function"==typeof t.subarray}catch(e){return!1}}(),o.isEncoding=function(e){switch(String(e).toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"binary":case"base64":case"raw":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return!0;default:return!1}},o.isBuffer=function(e){return!(null==e||!e._isBuffer)},o.byteLength=function(e,t){var r;switch(e+="",t||"utf8"){case"hex":r=e.length/2;break;case"utf8":case"utf-8":r=P(e).length;break;case"ascii":case"binary":case"raw":r=e.length;break;case"base64":r=M(e).length;break;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":r=2*e.length;break;default:throw Error("Unknown encoding")}return r},o.concat=function(e,t){if(B(C(e),"Usage: Buffer.concat(list, [totalLength])\nlist should be an Array."),0===e.length)return new o(0);if(1===e.length)return e[0];if("number"!=typeof t)for(i=t=0;i<e.length;i++)t+=e[i].length;for(var r=new o(t),n=0,i=0;i<e.length;i++){var a=e[i];a.copy(r,n),n+=a.length}return r},o.prototype.write=function(e,t,r,n){isFinite(t)?isFinite(r)||(n=r,r=void 0):(h=n,n=t,t=r,r=h),t=Number(t)||0;var i,a,l,s,c,u,d,p,h=this.length-t;switch((!r||h<(r=Number(r)))&&(r=h),n=String(n||"utf8").toLowerCase()){case"hex":c=function(e,t,r,n){r=Number(r)||0;var i=e.length-r;(!n||i<(n=Number(n)))&&(n=i),B((i=t.length)%2==0,"Invalid hex string"),i/2<n&&(n=i/2);for(var a=0;a<n;a++){var l=parseInt(t.substr(2*a,2),16);B(!isNaN(l),"Invalid hex string"),e[r+a]=l}return o._charsWritten=2*a,a}(this,e,t,r);break;case"utf8":case"utf-8":u=this,d=t,p=r,c=o._charsWritten=O(P(e),u,d,p);break;case"ascii":case"binary":i=t,a=r,c=o._charsWritten=O(function(e){for(var t=[],r=0;r<e.length;r++)t.push(255&e.charCodeAt(r));return t}(e),this,i,a);break;case"base64":u=this,d=t,p=r,c=o._charsWritten=O(M(e),u,d,p);break;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":l=t,s=r,c=o._charsWritten=O(function(e){for(var t,r,n=[],o=0;o<e.length;o++)t=(r=e.charCodeAt(o))>>8,n.push(r%=256),n.push(t);return n}(e),this,l,s);break;default:throw Error("Unknown encoding")}return c},o.prototype.toString=function(e,t,r){var n,o,i;if(e=String(e||"utf8").toLowerCase(),t=Number(t)||0,(r=void 0!==r?Number(r):this.length)===t)return"";switch(e){case"hex":n=function(e,t,r){var n=e.length;(!t||t<0)&&(t=0),(!r||r<0||n<r)&&(r=n);for(var o="",i=t;i<r;i++)o+=A(e[i]);return o}(this,t,r);break;case"utf8":case"utf-8":n=function(e,t,r){var n="",o="";r=Math.min(e.length,r);for(var i=t;i<r;i++)e[i]<=127?(n+=D(o)+String.fromCharCode(e[i]),o=""):o+="%"+e[i].toString(16);return n+D(o)}(this,t,r);break;case"ascii":case"binary":n=function(e,t,r){var n="";r=Math.min(e.length,r);for(var o=t;o<r;o++)n+=String.fromCharCode(e[o]);return n}(this,t,r);break;case"base64":i=r,n=0===(o=t)&&i===this.length?d.fromByteArray(this):d.fromByteArray(this.slice(o,i));break;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":n=function(e,t,r){for(var n=e.slice(t,r),o="",i=0;i<n.length;i+=2)o+=String.fromCharCode(n[i]+256*n[i+1]);return o}(this,t,r);break;default:throw Error("Unknown encoding")}return n},o.prototype.toJSON=function(){return{type:"Buffer",data:Array.prototype.slice.call(this._arr||this,0)}},o.prototype.copy=function(e,t,r,n){if(t=t||0,(n=n||0===n?n:this.length)!==(r=r||0)&&0!==e.length&&0!==this.length){B(r<=n,"sourceEnd < sourceStart"),B(0<=t&&t<e.length,"targetStart out of bounds"),B(0<=r&&r<this.length,"sourceStart out of bounds"),B(0<=n&&n<=this.length,"sourceEnd out of bounds"),n>this.length&&(n=this.length);var i=(n=e.length-t<n-r?e.length-t+r:n)-r;if(i<100||!o._useTypedArrays)for(var a=0;a<i;a++)e[a+t]=this[a+r];else e._set(this.subarray(r,r+i),t)}},o.prototype.slice=function(e,t){var r=this.length;if(e=z(e,r,0),t=z(t,r,r),o._useTypedArrays)return o._augment(this.subarray(e,t));for(var n=t-e,i=new o(n,void 0,!0),a=0;a<n;a++)i[a]=this[a+e];return i},o.prototype.get=function(e){return console.log(".get() is deprecated. Access using array indexes instead."),this.readUInt8(e)},o.prototype.set=function(e,t){return console.log(".set() is deprecated. Access using array indexes instead."),this.writeUInt8(e,t)},o.prototype.readUInt8=function(e,t){if(t||(B(null!=e,"missing offset"),B(e<this.length,"Trying to read beyond buffer length")),!(e>=this.length))return this[e]},o.prototype.readUInt16LE=function(e,t){return h(this,e,!0,t)},o.prototype.readUInt16BE=function(e,t){return h(this,e,!1,t)},o.prototype.readUInt32LE=function(e,t){return f(this,e,!0,t)},o.prototype.readUInt32BE=function(e,t){return f(this,e,!1,t)},o.prototype.readInt8=function(e,t){if(t||(B(null!=e,"missing offset"),B(e<this.length,"Trying to read beyond buffer length")),!(e>=this.length))return 128&this[e]?-1*(255-this[e]+1):this[e]},o.prototype.readInt16LE=function(e,t){return v(this,e,!0,t)},o.prototype.readInt16BE=function(e,t){return v(this,e,!1,t)},o.prototype.readInt32LE=function(e,t){return g(this,e,!0,t)},o.prototype.readInt32BE=function(e,t){return g(this,e,!1,t)},o.prototype.readFloatLE=function(e,t){return m(this,e,!0,t)},o.prototype.readFloatBE=function(e,t){return m(this,e,!1,t)},o.prototype.readDoubleLE=function(e,t){return _(this,e,!0,t)},o.prototype.readDoubleBE=function(e,t){return _(this,e,!1,t)},o.prototype.writeUInt8=function(e,t,r){r||(B(null!=e,"missing value"),B(null!=t,"missing offset"),B(t<this.length,"trying to write beyond buffer length"),T(e,255)),t>=this.length||(this[t]=e)},o.prototype.writeUInt16LE=function(e,t,r){b(this,e,t,!0,r)},o.prototype.writeUInt16BE=function(e,t,r){b(this,e,t,!1,r)},o.prototype.writeUInt32LE=function(e,t,r){y(this,e,t,!0,r)},o.prototype.writeUInt32BE=function(e,t,r){y(this,e,t,!1,r)},o.prototype.writeInt8=function(e,t,r){r||(B(null!=e,"missing value"),B(null!=t,"missing offset"),B(t<this.length,"Trying to write beyond buffer length"),N(e,127,-128)),t>=this.length||(0<=e?this.writeUInt8(e,t,r):this.writeUInt8(255+e+1,t,r))},o.prototype.writeInt16LE=function(e,t,r){k(this,e,t,!0,r)},o.prototype.writeInt16BE=function(e,t,r){k(this,e,t,!1,r)},o.prototype.writeInt32LE=function(e,t,r){w(this,e,t,!0,r)},o.prototype.writeInt32BE=function(e,t,r){w(this,e,t,!1,r)},o.prototype.writeFloatLE=function(e,t,r){S(this,e,t,!0,r)},o.prototype.writeFloatBE=function(e,t,r){S(this,e,t,!1,r)},o.prototype.writeDoubleLE=function(e,t,r){I(this,e,t,!0,r)},o.prototype.writeDoubleBE=function(e,t,r){I(this,e,t,!1,r)},o.prototype.fill=function(e,t,r){if(t=t||0,r=r||this.length,B("number"==typeof(e="string"==typeof(e=e||0)?e.charCodeAt(0):e)&&!isNaN(e),"value is not a number"),B(t<=r,"end < start"),r!==t&&0!==this.length){B(0<=t&&t<this.length,"start out of bounds"),B(0<=r&&r<=this.length,"end out of bounds");for(var n=t;n<r;n++)this[n]=e}},o.prototype.inspect=function(){for(var e=[],t=this.length,n=0;n<t;n++)if(e[n]=A(this[n]),n===r.INSPECT_MAX_BYTES){e[n+1]="...";break}return"<Buffer "+e.join(" ")+">"},o.prototype.toArrayBuffer=function(){if("u"<typeof Uint8Array)throw Error("Buffer.toArrayBuffer not supported in this browser");if(o._useTypedArrays)return new o(this).buffer;for(var e=new Uint8Array(this.length),t=0,r=e.length;t<r;t+=1)e[t]=this[t];return e.buffer};var j=o.prototype;function z(e,t,r){return"number"!=typeof e?r:t<=(e=~~e)?t:0<=e||0<=(e+=t)?e:0}function E(e){return(e=~~Math.ceil(+e))<0?0:e}function C(e){return(Array.isArray||function(e){return"[object Array]"===Object.prototype.toString.call(e)})(e)}function A(e){return e<16?"0"+e.toString(16):e.toString(16)}function P(e){for(var t=[],r=0;r<e.length;r++){var n=e.charCodeAt(r);if(n<=127)t.push(e.charCodeAt(r));else for(var o=r,i=(55296<=n&&n<=57343&&r++,encodeURIComponent(e.slice(o,r+1)).substr(1).split("%")),a=0;a<i.length;a++)t.push(parseInt(i[a],16))}return t}function M(e){return d.toByteArray(e)}function O(e,t,r,n){for(var o=0;o<n&&!(o+r>=t.length||o>=e.length);o++)t[o+r]=e[o];return o}function D(e){try{return decodeURIComponent(e)}catch(e){return String.fromCharCode(65533)}}function T(e,t){B("number"==typeof e,"cannot write a non-number as a number"),B(0<=e,"specified a negative value for writing an unsigned value"),B(e<=t,"value is larger than maximum value for type"),B(Math.floor(e)===e,"value has a fractional component")}function N(e,t,r){B("number"==typeof e,"cannot write a non-number as a number"),B(e<=t,"value larger than maximum allowed value"),B(r<=e,"value smaller than minimum allowed value"),B(Math.floor(e)===e,"value has a fractional component")}function L(e,t,r){B("number"==typeof e,"cannot write a non-number as a number"),B(e<=t,"value larger than maximum allowed value"),B(r<=e,"value smaller than minimum allowed value")}function B(e,t){if(!e)throw Error(t||"Failed assertion")}o._augment=function(e){return e._isBuffer=!0,e._get=e.get,e._set=e.set,e.get=j.get,e.set=j.set,e.write=j.write,e.toString=j.toString,e.toLocaleString=j.toString,e.toJSON=j.toJSON,e.copy=j.copy,e.slice=j.slice,e.readUInt8=j.readUInt8,e.readUInt16LE=j.readUInt16LE,e.readUInt16BE=j.readUInt16BE,e.readUInt32LE=j.readUInt32LE,e.readUInt32BE=j.readUInt32BE,e.readInt8=j.readInt8,e.readInt16LE=j.readInt16LE,e.readInt16BE=j.readInt16BE,e.readInt32LE=j.readInt32LE,e.readInt32BE=j.readInt32BE,e.readFloatLE=j.readFloatLE,e.readFloatBE=j.readFloatBE,e.readDoubleLE=j.readDoubleLE,e.readDoubleBE=j.readDoubleBE,e.writeUInt8=j.writeUInt8,e.writeUInt16LE=j.writeUInt16LE,e.writeUInt16BE=j.writeUInt16BE,e.writeUInt32LE=j.writeUInt32LE,e.writeUInt32BE=j.writeUInt32BE,e.writeInt8=j.writeInt8,e.writeInt16LE=j.writeInt16LE,e.writeInt16BE=j.writeInt16BE,e.writeInt32LE=j.writeInt32LE,e.writeInt32BE=j.writeInt32BE,e.writeFloatLE=j.writeFloatLE,e.writeFloatBE=j.writeFloatBE,e.writeDoubleLE=j.writeDoubleLE,e.writeDoubleBE=j.writeDoubleBE,e.fill=j.fill,e.inspect=j.inspect,e.toArrayBuffer=j.toArrayBuffer,e}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/buffer/index.js","/node_modules/gulp-browserify/node_modules/buffer")},{"base64-js":2,buffer:3,ieee754:10,lYpoI2:11}],4:[function(e,t,r){(function(r,n,o,i,a,l,s,c,u){var o=e("buffer").Buffer,d=new o(4);d.fill(0),t.exports={hash:function(e,t,r,n){for(var i=t(function(e,t){e.length%4!=0&&(r=e.length+(4-e.length%4),e=o.concat([e,d],r));for(var r,n=[],i=t?e.readInt32BE:e.readInt32LE,a=0;a<e.length;a+=4)n.push(i.call(e,a));return n}(e=o.isBuffer(e)?e:new o(e),n),8*e.length),t=n,a=new o(r),l=t?a.writeInt32BE:a.writeInt32LE,s=0;s<i.length;s++)l.call(a,i[s],4*s,!0);return a}}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/crypto-browserify/helpers.js","/node_modules/gulp-browserify/node_modules/crypto-browserify")},{buffer:3,lYpoI2:11}],5:[function(e,t,r){(function(t,n,o,i,a,l,s,c,u){var o=e("buffer").Buffer,d=e("./sha"),p=e("./sha256"),h=e("./rng"),f={sha1:d,sha256:p,md5:e("./md5")},v=new o(64);function g(e,t){var r=f[e=e||"sha1"],n=[];return r||m("algorithm:",e,"is not yet supported"),{update:function(e){return o.isBuffer(e)||(e=new o(e)),n.push(e),e.length,this},digest:function(e){var i=o.concat(n),i=t?function(e,t,r){o.isBuffer(t)||(t=new o(t)),o.isBuffer(r)||(r=new o(r)),t.length>64?t=e(t):t.length<64&&(t=o.concat([t,v],64));for(var n=new o(64),i=new o(64),a=0;a<64;a++)n[a]=54^t[a],i[a]=92^t[a];return r=e(o.concat([n,r])),e(o.concat([i,r]))}(r,t,i):r(i);return n=null,e?i.toString(e):i}}}function m(){var e=[].slice.call(arguments).join(" ");throw Error([e,"we accept pull requests\nhttp://github.com/dominictarr/crypto-browserify"].join("\n"))}v.fill(0),r.createHash=function(e){return g(e)},r.createHmac=g,r.randomBytes=function(e,t){if(!t||!t.call)return new o(h(e));try{t.call(this,void 0,new o(h(e)))}catch(e){t(e)}};var _,b=["createCredentials","createCipher","createCipheriv","createDecipher","createDecipheriv","createSign","createVerify","createDiffieHellman","pbkdf2"],y=function(e){r[e]=function(){m("sorry,",e,"is not implemented yet")}};for(_ in b)y(b[_])}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/crypto-browserify/index.js","/node_modules/gulp-browserify/node_modules/crypto-browserify")},{"./md5":6,"./rng":7,"./sha":8,"./sha256":9,buffer:3,lYpoI2:11}],6:[function(e,t,r){(function(r,n,o,i,a,l,s,c,u){var d=e("./helpers");function p(e,t){e[t>>5]|=128<<t%32,e[14+(t+64>>>9<<4)]=t;for(var r=0x67452301,n=-0x10325477,o=-0x67452302,i=0x10325476,a=0;a<e.length;a+=16){var l=r,s=n,c=o,u=i,r=f(r,n,o,i,e[a+0],7,-0x28955b88),i=f(i,r,n,o,e[a+1],12,-0x173848aa),o=f(o,i,r,n,e[a+2],17,0x242070db),n=f(n,o,i,r,e[a+3],22,-0x3e423112);r=f(r,n,o,i,e[a+4],7,-0xa83f051),i=f(i,r,n,o,e[a+5],12,0x4787c62a),o=f(o,i,r,n,e[a+6],17,-0x57cfb9ed),n=f(n,o,i,r,e[a+7],22,-0x2b96aff),r=f(r,n,o,i,e[a+8],7,0x698098d8),i=f(i,r,n,o,e[a+9],12,-0x74bb0851),o=f(o,i,r,n,e[a+10],17,-42063),n=f(n,o,i,r,e[a+11],22,-0x76a32842),r=f(r,n,o,i,e[a+12],7,0x6b901122),i=f(i,r,n,o,e[a+13],12,-0x2678e6d),o=f(o,i,r,n,e[a+14],17,-0x5986bc72),r=v(r,n=f(n,o,i,r,e[a+15],22,0x49b40821),o,i,e[a+1],5,-0x9e1da9e),i=v(i,r,n,o,e[a+6],9,-0x3fbf4cc0),o=v(o,i,r,n,e[a+11],14,0x265e5a51),n=v(n,o,i,r,e[a+0],20,-0x16493856),r=v(r,n,o,i,e[a+5],5,-0x29d0efa3),i=v(i,r,n,o,e[a+10],9,0x2441453),o=v(o,i,r,n,e[a+15],14,-0x275e197f),n=v(n,o,i,r,e[a+4],20,-0x182c0438),r=v(r,n,o,i,e[a+9],5,0x21e1cde6),i=v(i,r,n,o,e[a+14],9,-0x3cc8f82a),o=v(o,i,r,n,e[a+3],14,-0xb2af279),n=v(n,o,i,r,e[a+8],20,0x455a14ed),r=v(r,n,o,i,e[a+13],5,-0x561c16fb),i=v(i,r,n,o,e[a+2],9,-0x3105c08),o=v(o,i,r,n,e[a+7],14,0x676f02d9),r=g(r,n=v(n,o,i,r,e[a+12],20,-0x72d5b376),o,i,e[a+5],4,-378558),i=g(i,r,n,o,e[a+8],11,-0x788e097f),o=g(o,i,r,n,e[a+11],16,0x6d9d6122),n=g(n,o,i,r,e[a+14],23,-0x21ac7f4),r=g(r,n,o,i,e[a+1],4,-0x5b4115bc),i=g(i,r,n,o,e[a+4],11,0x4bdecfa9),o=g(o,i,r,n,e[a+7],16,-0x944b4a0),n=g(n,o,i,r,e[a+10],23,-0x41404390),r=g(r,n,o,i,e[a+13],4,0x289b7ec6),i=g(i,r,n,o,e[a+0],11,-0x155ed806),o=g(o,i,r,n,e[a+3],16,-0x2b10cf7b),n=g(n,o,i,r,e[a+6],23,0x4881d05),r=g(r,n,o,i,e[a+9],4,-0x262b2fc7),i=g(i,r,n,o,e[a+12],11,-0x1924661b),o=g(o,i,r,n,e[a+15],16,0x1fa27cf8),r=m(r,n=g(n,o,i,r,e[a+2],23,-0x3b53a99b),o,i,e[a+0],6,-0xbd6ddbc),i=m(i,r,n,o,e[a+7],10,0x432aff97),o=m(o,i,r,n,e[a+14],15,-0x546bdc59),n=m(n,o,i,r,e[a+5],21,-0x36c5fc7),r=m(r,n,o,i,e[a+12],6,0x655b59c3),i=m(i,r,n,o,e[a+3],10,-0x70f3336e),o=m(o,i,r,n,e[a+10],15,-1051523),n=m(n,o,i,r,e[a+1],21,-0x7a7ba22f),r=m(r,n,o,i,e[a+8],6,0x6fa87e4f),i=m(i,r,n,o,e[a+15],10,-0x1d31920),o=m(o,i,r,n,e[a+6],15,-0x5cfebcec),n=m(n,o,i,r,e[a+13],21,0x4e0811a1),r=m(r,n,o,i,e[a+4],6,-0x8ac817e),i=m(i,r,n,o,e[a+11],10,-0x42c50dcb),o=m(o,i,r,n,e[a+2],15,0x2ad7d2bb),n=m(n,o,i,r,e[a+9],21,-0x14792c6f),r=_(r,l),n=_(n,s),o=_(o,c),i=_(i,u)}return[r,n,o,i]}function h(e,t,r,n,o,i){return _((t=_(_(t,e),_(n,i)))<<o|t>>>32-o,r)}function f(e,t,r,n,o,i,a){return h(t&r|~t&n,e,t,o,i,a)}function v(e,t,r,n,o,i,a){return h(t&n|r&~n,e,t,o,i,a)}function g(e,t,r,n,o,i,a){return h(t^r^n,e,t,o,i,a)}function m(e,t,r,n,o,i,a){return h(r^(t|~n),e,t,o,i,a)}function _(e,t){var r=(65535&e)+(65535&t);return(e>>16)+(t>>16)+(r>>16)<<16|65535&r}t.exports=function(e){return d.hash(e,p,16)}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/crypto-browserify/md5.js","/node_modules/gulp-browserify/node_modules/crypto-browserify")},{"./helpers":4,buffer:3,lYpoI2:11}],7:[function(e,t,r){(function(e,r,n,o,i,a,l,s,c){t.exports=function(e){for(var t,r=Array(e),n=0;n<e;n++)0==(3&n)&&(t=0x100000000*Math.random()),r[n]=t>>>((3&n)<<3)&255;return r}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/crypto-browserify/rng.js","/node_modules/gulp-browserify/node_modules/crypto-browserify")},{buffer:3,lYpoI2:11}],8:[function(e,t,r){(function(r,n,o,i,a,l,s,c,u){var d=e("./helpers");function p(e,t){e[t>>5]|=128<<24-t%32,e[15+(t+64>>9<<4)]=t;for(var r,n,o,i=Array(80),a=0x67452301,l=-0x10325477,s=-0x67452302,c=0x10325476,u=-0x3c2d1e10,d=0;d<e.length;d+=16){for(var p=a,v=l,g=s,m=c,_=u,b=0;b<80;b++){i[b]=b<16?e[d+b]:f(i[b-3]^i[b-8]^i[b-14]^i[b-16],1);var y=h(h(f(a,5),(y=l,n=s,o=c,(r=b)<20?y&n|~y&o:!(r<40)&&r<60?y&n|y&o|n&o:y^n^o)),h(h(u,i[b]),(r=b)<20?0x5a827999:r<40?0x6ed9eba1:r<60?-0x70e44324:-0x359d3e2a)),u=c,c=s,s=f(l,30),l=a,a=y}a=h(a,p),l=h(l,v),s=h(s,g),c=h(c,m),u=h(u,_)}return[a,l,s,c,u]}function h(e,t){var r=(65535&e)+(65535&t);return(e>>16)+(t>>16)+(r>>16)<<16|65535&r}function f(e,t){return e<<t|e>>>32-t}t.exports=function(e){return d.hash(e,p,20,!0)}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/crypto-browserify/sha.js","/node_modules/gulp-browserify/node_modules/crypto-browserify")},{"./helpers":4,buffer:3,lYpoI2:11}],9:[function(e,t,r){(function(r,n,o,i,a,l,s,c,u){function d(e,t){var r=(65535&e)+(65535&t);return(e>>16)+(t>>16)+(r>>16)<<16|65535&r}function p(e,t){var r,n=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0xfc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x6ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2],o=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],i=Array(64);e[t>>5]|=128<<24-t%32,e[15+(t+64>>9<<4)]=t;for(var a,l,s=0;s<e.length;s+=16){for(var c=o[0],u=o[1],p=o[2],h=o[3],g=o[4],m=o[5],_=o[6],b=o[7],y=0;y<64;y++)i[y]=y<16?e[y+s]:d(d(d(f(l=i[y-2],17)^f(l,19)^v(l,10),i[y-7]),f(l=i[y-15],7)^f(l,18)^v(l,3)),i[y-16]),r=d(d(d(d(b,f(l=g,6)^f(l,11)^f(l,25)),g&m^~g&_),n[y]),i[y]),a=d(f(a=c,2)^f(a,13)^f(a,22),c&u^c&p^u&p),b=_,_=m,m=g,g=d(h,r),h=p,p=u,u=c,c=d(r,a);o[0]=d(c,o[0]),o[1]=d(u,o[1]),o[2]=d(p,o[2]),o[3]=d(h,o[3]),o[4]=d(g,o[4]),o[5]=d(m,o[5]),o[6]=d(_,o[6]),o[7]=d(b,o[7])}return o}var h=e("./helpers"),f=function(e,t){return e>>>t|e<<32-t},v=function(e,t){return e>>>t};t.exports=function(e){return h.hash(e,p,32,!0)}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/crypto-browserify/sha256.js","/node_modules/gulp-browserify/node_modules/crypto-browserify")},{"./helpers":4,buffer:3,lYpoI2:11}],10:[function(e,t,r){(function(e,t,n,o,i,a,l,s,c){r.read=function(e,t,r,n,o){var i,a,l=8*o-n-1,s=(1<<l)-1,c=s>>1,u=-7,d=r?o-1:0,p=r?-1:1,o=e[t+d];for(d+=p,i=o&(1<<-u)-1,o>>=-u,u+=l;0<u;i=256*i+e[t+d],d+=p,u-=8);for(a=i&(1<<-u)-1,i>>=-u,u+=n;0<u;a=256*a+e[t+d],d+=p,u-=8);if(0===i)i=1-c;else{if(i===s)return a?NaN:1/0*(o?-1:1);a+=Math.pow(2,n),i-=c}return(o?-1:1)*a*Math.pow(2,i-n)},r.write=function(e,t,r,n,o,i){var a,l,s=8*i-o-1,c=(1<<s)-1,u=c>>1,d=5960464477539062e-23*(23===o),p=n?0:i-1,h=n?1:-1,i=+(t<0||0===t&&1/t<0);for(isNaN(t=Math.abs(t))||t===1/0?(l=+!!isNaN(t),a=c):(a=Math.floor(Math.log(t)/Math.LN2),t*(n=Math.pow(2,-a))<1&&(a--,n*=2),2<=(t+=1<=a+u?d/n:d*Math.pow(2,1-u))*n&&(a++,n/=2),c<=a+u?(l=0,a=c):1<=a+u?(l=(t*n-1)*Math.pow(2,o),a+=u):(l=t*Math.pow(2,u-1)*Math.pow(2,o),a=0));8<=o;e[r+p]=255&l,p+=h,l/=256,o-=8);for(a=a<<o|l,s+=o;0<s;e[r+p]=255&a,p+=h,a/=256,s-=8);e[r+p-h]|=128*i}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/ieee754/index.js","/node_modules/gulp-browserify/node_modules/ieee754")},{buffer:3,lYpoI2:11}],11:[function(e,t,r){(function(e,r,n,o,i,a,l,s,c){var u,d,p;function h(){}(e=t.exports={}).nextTick=(d="u">typeof window&&window.setImmediate,p="u">typeof window&&window.postMessage&&window.addEventListener,d?function(e){return window.setImmediate(e)}:p?(u=[],window.addEventListener("message",function(e){var t=e.source;t!==window&&null!==t||"process-tick"!==e.data||(e.stopPropagation(),0<u.length&&u.shift()())},!0),function(e){u.push(e),window.postMessage("process-tick","*")}):function(e){setTimeout(e,0)}),e.title="browser",e.browser=!0,e.env={},e.argv=[],e.on=h,e.addListener=h,e.once=h,e.off=h,e.removeListener=h,e.removeAllListeners=h,e.emit=h,e.binding=function(e){throw Error("process.binding is not supported")},e.cwd=function(){return"/"},e.chdir=function(e){throw Error("process.chdir is not supported")}}).call(this,e("lYpoI2"),"u">typeof self?self:"u">typeof window?window:{},e("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/process/browser.js","/node_modules/gulp-browserify/node_modules/process")},{buffer:3,lYpoI2:11}]},{},[1])(1)},343007,e=>{"use strict";let t,r,n,o,i,a;var l,s,c,u,d,p,h,f,v,g,m,_,b,y,k,w,S,I,j,z,E,C,A,P,M,O,D,T,N,L,B,R,F,V,$,W,H,q,U,Z,Y,X,K,J,G,Q,ee,et,er,en,eo,ei,ea,el,es,ec,eu,ed,ep,eh,ef,ev,eg,em,e_,eb,ex,ey,ek,ew,eS,eI,ej,ez,eE,eC,eA,eP,eM,eO,eD,eT,eN,eL,eB,eR,eF,eV,e$,eW,eH,eq,eU,eZ,eY,eX,eK,eJ,eG,eQ,e0,e1,e2,e4,e3,e6,e5,e8,e9,e7,te,tt,tr,tn,to,ti,ta,tl,ts,tc,tu,td,tp,th,tf,tv,tg,tm,t_,tb,tx,ty,tk,tw,tS,tI,tj,tz,tE,tC,tA,tP,tM,tO,tD,tT,tN,tL,tB,tR,tF,tV,t$,tW,tH,tq,tU,tZ,tY,tX,tK,tJ,tG,tQ,t0,t1,t2,t4,t3,t6,t5,t8,t9,t7,re,rt,rr,rn,ro,ri,ra,rl,rs,rc,ru,rd,rp,rh,rf,rv,rg=e.i(843476);e.i(782502);var rm=e.i(190845),r_=e.i(271645),rb=e.i(522016),rx=e.i(11848),ry=e.i(236329),rk=e.i(416031),rw=e.i(793821),rS=e.i(768653),rI=e.i(296568);(0,rI.init_react_import)(),(0,rI.init_react_import)(),(0,rI.init_react_import)(),(0,rI.init_react_import)(),(0,rI.init_react_import)(),(0,rI.init_react_import)();var rj=(e,t=e)=>({slot:({value:r,propName:n,field:o,isReadOnly:i})=>{let a=i?t:e;return e=>a((0,rI.__spreadProps)((0,rI.__spreadValues)({allow:(null==o?void 0:o.type)==="slot"?o.allow:[],disallow:(null==o?void 0:o.type)==="slot"?o.disallow:[]},e),{zone:n,content:r}))}});function rz(e,t,r){let n={};return Object.keys(e).forEach(o=>{n[o]=n=>{var{parentId:i}=n,a=(0,rI.__objRest)(n,["parentId"]);let l=a.propPath.replace(/\[\d+\]/g,"[*]"),s=(null==t?void 0:t[a.propPath])||(null==t?void 0:t[l])||r||!1,c=e[o];return null==c?void 0:c((0,rI.__spreadProps)((0,rI.__spreadValues)({},a),{field:a.field,isReadOnly:s,componentId:i}))}}),n}function rE(e,t,r,n=r,o,i){var a;let l,s;return a=rj(r,n),l=(0,r_.useMemo)(()=>rz(a,o,i),[a,o,i]),s=(0,r_.useMemo)(()=>(0,rS.mapFields)(t,l,e).props,[e,t,l]),(0,r_.useMemo)(()=>(0,rI.__spreadValues)((0,rI.__spreadValues)({},t.props),s),[t.props,s])}(0,rI.init_react_import)(),(0,rI.init_react_import)(),(0,rI.init_react_import)(),(0,rI.init_react_import)(),(0,rI.init_react_import)();var rC=(0,rw.get_class_name_factory_default)("RichTextEditor",ry.styles_module_default);function rA({content:e}){return(0,rg.jsx)("div",{className:rC(),children:(0,rg.jsx)("div",{className:"rich-text",dangerouslySetInnerHTML:{__html:e}})})}(0,rI.init_react_import)();var rP=(e,t,r)=>{if(!e)return null;if(0===t.length)return r(e);let[n,...o]=t;return Array.isArray(e)?e.map(e=>rP(e,t,r)):(0,rI.__spreadProps)((0,rI.__spreadValues)({},e),{[n]:rP(e[n],o,r)})},rM=(0,r_.lazy)(()=>e.A(302728).then(e=>({default:e.RichTextRender})));function rO(e,t){let r=(e,t=[])=>{if(!e)return[];let n=[];for(let[o,i]of Object.entries(e)){let e=[...t,o];"richtext"===i.type&&n.push({path:e,field:i}),"array"===i.type&&"arrayFields"in i&&n.push(...r(i.arrayFields,e)),"object"===i.type&&"objectFields"in i&&n.push(...r(i.objectFields,e))}return n},n=(0,r_.useMemo)(()=>r(e),[e]);return(0,r_.useMemo)(()=>{if(!(null==n?void 0:n.length))return{};let e=(0,rI.__spreadValues)({},t);for(let{path:t,field:r}of n)e=rP(e,t,e=>(0,rg.jsx)(r_.Suspense,{fallback:(0,rg.jsx)(rA,{content:e}),children:(0,rg.jsx)(rM,{content:e,field:r})},t.join(".")));return e},[n,t,e])}(0,rI.init_react_import)();var rD=e=>(0,rg.jsx)(rN,(0,rI.__spreadValues)({},e)),rT=({config:e,item:t,metadata:r})=>{let n=e.components[t.type],o=rE(e,t,t=>(0,rg.jsx)(rD,(0,rI.__spreadProps)((0,rI.__spreadValues)({},t),{config:e,metadata:r}))),i=rO(n.fields,o);return(0,rg.jsx)(n.render,(0,rI.__spreadProps)((0,rI.__spreadValues)((0,rI.__spreadValues)({},o),i),{puck:(0,rI.__spreadProps)((0,rI.__spreadValues)({},o.puck),{metadata:r||{}})}))},rN=(0,r_.forwardRef)(function({className:e,style:t,content:r,config:n,metadata:o,as:i},a){return(0,rg.jsx)(null!=i?i:"div",{className:e,style:t,ref:a,children:r.map(e=>n.components[e.type]?(0,rg.jsx)(rT,{config:n,item:e,metadata:o},e.props.id):null)})}),rL=e.i(709071),rB=e.i(584173),rR=e.i(54396),rF=rI,rV=rg;let r$=(e,t)=>{let r=e instanceof Map?e:new Map(e.entries()),n=t instanceof Map?t:new Map(t.entries());if(r.size!==n.size)return!1;for(let[e,t]of r)if(!n.has(e)||!Object.is(t,n.get(e)))return!1;return!0};function rW(e){let t=r_.default.useRef(void 0);return r=>{let n=e(r);return!function(e,t){if(Object.is(e,t))return!0;if("object"!=typeof e||null===e||"object"!=typeof t||null===t||Object.getPrototypeOf(e)!==Object.getPrototypeOf(t))return!1;if(Symbol.iterator in e&&Symbol.iterator in t){if("entries"in e&&"entries"in t)return r$(e,t);let r=e[Symbol.iterator](),n=t[Symbol.iterator](),o=r.next(),i=n.next();for(;!o.done&&!i.done;){if(!Object.is(o.value,i.value))return!1;o=r.next(),i=n.next()}return!!o.done&&!!i.done}return r$({entries:()=>Object.entries(e)},{entries:()=>Object.entries(t)})}(t.current,n)?t.current=n:t.current}}var rH=e.i(408155),rq=e.i(768834),rU=e.i(579473),rZ=Symbol.for("preact-signals");function rY(){if(r0>1)r0--;else{var e,t=!1,r=r3;for(r3=void 0;void 0!==r;){var n=r.S;if(n.v===r.v)for(var o=n.t;void 0!==o;o=o.x)o.i===r.i&&(o.i=n.i);r=r.o}for(;void 0!==rQ;){var i=rQ;for(rQ=void 0,r1++;void 0!==i;){var a=i.u;if(i.u=void 0,i.f&=-3,!(8&i.f)&&r7(i))try{i.c()}catch(r){t||(e=r,t=!0)}i=a}}if(r1=0,r0--,t)throw e}}function rX(e){if(r0>0)return e();r4=++r2,r0++;try{return e()}finally{rY()}}var rK,rJ=void 0;function rG(e){var t=rJ,r=rK;rJ=void 0,rK=void 0;try{return e()}finally{rJ=t,rK=r}}var rQ=void 0,r0=0,r1=0,r2=0,r4=0,r3=void 0,r6=0;function r5(e){if(void 0!==rJ){var t=e.n;if(void 0===t||t.t!==rJ)return t={i:0,S:e,p:rJ.s,n:void 0,t:rJ,e:void 0,x:void 0,r:t},void 0!==rJ.s&&(rJ.s.n=t),rJ.s=t,e.n=t,32&rJ.f&&e.S(t),t;if(-1===t.i)return t.i=0,void 0!==t.n&&(t.n.p=t.p,void 0!==t.p&&(t.p.n=t.n),t.p=rJ.s,t.n=void 0,rJ.s.n=t,rJ.s=t),t}}function r8(e,t){this.v=e,this.i=0,this.n=void 0,this.t=void 0,this.l=0,this.W=null==t?void 0:t.watched,this.Z=null==t?void 0:t.unwatched,this.name=null==t?void 0:t.name}function r9(e,t){return new r8(e,t)}function r7(e){for(var t=e.s;void 0!==t;t=t.n)if(t.S.i!==t.i||!t.S.h()||t.S.i!==t.i)return!0;return!1}function ne(e){for(var t=e.s;void 0!==t;t=t.n){var r=t.S.n;if(void 0!==r&&(t.r=r),t.S.n=t,t.i=-1,void 0===t.n){e.s=t;break}}}function nt(e){for(var t=e.s,r=void 0;void 0!==t;){var n=t.p;-1===t.i?(t.S.U(t),void 0!==n&&(n.n=t.n),void 0!==t.n&&(t.n.p=n)):r=t,t.S.n=t.r,void 0!==t.r&&(t.r=void 0),t=n}e.s=r}function nr(e,t){r8.call(this,void 0,t),this.x=e,this.s=void 0,this.g=r6-1,this.f=4}function nn(e){var t=e.m;if(e.m=void 0,"function"==typeof t){r0++;var r=rJ;rJ=void 0;try{t()}catch(t){throw e.f&=-2,e.f|=8,no(e),t}finally{rJ=r,rY()}}}function no(e){for(var t=e.s;void 0!==t;t=t.n)t.S.U(t);e.x=void 0,e.s=void 0,nn(e)}function ni(e){if(rJ!==this)throw Error("Out-of-order effect");nt(this),rJ=e,this.f&=-2,8&this.f&&no(this),rY()}function na(e,t){this.x=e,this.m=void 0,this.s=void 0,this.u=void 0,this.f=32,this.name=null==t?void 0:t.name,rK&&rK.push(this)}function nl(e,t){var r=new na(e,t);try{r.c()}catch(e){throw r.d(),e}var n=r.d.bind(r);return n[Symbol.dispose]=n,n}r8.prototype.brand=rZ,r8.prototype.h=function(){return!0},r8.prototype.S=function(e){var t=this,r=this.t;r!==e&&void 0===e.e&&(e.x=r,this.t=e,void 0!==r?r.e=e:rG(function(){var e;null==(e=t.W)||e.call(t)}))},r8.prototype.U=function(e){var t=this;if(void 0!==this.t){var r=e.e,n=e.x;void 0!==r&&(r.x=n,e.e=void 0),void 0!==n&&(n.e=r,e.x=void 0),e===this.t&&(this.t=n,void 0===n&&rG(function(){var e;null==(e=t.Z)||e.call(t)}))}},r8.prototype.subscribe=function(e){var t=this;return nl(function(){var r=t.value;rG(function(){return e(r)})},{name:"sub"})},r8.prototype.valueOf=function(){return this.value},r8.prototype.toString=function(){return this.value+""},r8.prototype.toJSON=function(){return this.value},r8.prototype.peek=function(){var e=this;return rG(function(){return e.value})},Object.defineProperty(r8.prototype,"value",{get:function(){var e=r5(this);return void 0!==e&&(e.i=this.i),this.v},set:function(e){if(e!==this.v){if(r1>100)throw Error("Cycle detected");0!==r0&&0===r1&&this.l!==r4&&(this.l=r4,r3={S:this,v:this.v,i:this.i,o:r3}),this.v=e,this.i++,r6++,r0++;try{for(var t=this.t;void 0!==t;t=t.x)t.t.N()}finally{rY()}}}}),nr.prototype=new r8,nr.prototype.h=function(){if(this.f&=-3,1&this.f)return!1;if(32==(36&this.f)||(this.f&=-5,this.g===r6))return!0;if(this.g=r6,this.f|=1,this.i>0&&!r7(this))return this.f&=-2,!0;var e=rJ;try{ne(this),rJ=this;var t=this.x();(16&this.f||this.v!==t||0===this.i)&&(this.v=t,this.f&=-17,this.i++)}catch(e){this.v=e,this.f|=16,this.i++}return rJ=e,nt(this),this.f&=-2,!0},nr.prototype.S=function(e){if(void 0===this.t){this.f|=36;for(var t=this.s;void 0!==t;t=t.n)t.S.S(t)}r8.prototype.S.call(this,e)},nr.prototype.U=function(e){if(void 0!==this.t&&(r8.prototype.U.call(this,e),void 0===this.t)){this.f&=-33;for(var t=this.s;void 0!==t;t=t.n)t.S.U(t)}},nr.prototype.N=function(){if(!(2&this.f)){this.f|=6;for(var e=this.t;void 0!==e;e=e.x)e.t.N()}},Object.defineProperty(nr.prototype,"value",{get:function(){if(1&this.f)throw Error("Cycle detected");var e=r5(this);if(this.h(),void 0!==e&&(e.i=this.i),16&this.f)throw this.v;return this.v}}),na.prototype.c=function(){var e=this.S();try{if(8&this.f||void 0===this.x)return;var t=this.x();"function"==typeof t&&(this.m=t)}finally{e()}},na.prototype.S=function(){if(1&this.f)throw Error("Cycle detected");this.f|=1,this.f&=-9,nn(this),ne(this),r0++;var e=rJ;return rJ=this,ni.bind(this,e)},na.prototype.N=function(){2&this.f||(this.f|=2,this.u=rQ,rQ=this)},na.prototype.d=function(){this.f|=8,1&this.f||no(this)},na.prototype.dispose=function(){this.d()};var ns=Object.create,nc=Object.defineProperty,nu=Object.defineProperties,nd=Object.getOwnPropertyDescriptor,np=Object.getOwnPropertyDescriptors,nh=Object.getOwnPropertySymbols,nf=Object.prototype.hasOwnProperty,nv=Object.prototype.propertyIsEnumerable,ng=e=>{throw TypeError(e)},nm=(e,t,r)=>t in e?nc(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,n_=(e,t)=>nc(e,"name",{value:t,configurable:!0}),nb=["class","method","getter","setter","accessor","field","value","get","set"],nx=e=>void 0!==e&&"function"!=typeof e?ng("Function expected"):e,ny=(e,t,r,n,o)=>({kind:nb[e],name:t,metadata:n,addInitializer:e=>r._?ng("Already initialized"):o.push(nx(e||null))}),nk=(e,t)=>{let r,n;return nm(t,(r="metadata",(n=Symbol[r])?n:Symbol.for("Symbol."+r)),e[3])},nw=(e,t,r,n)=>{for(var o=0,i=e[t>>1],a=i&&i.length;o<a;o++)1&t?i[o].call(r):n=i[o].call(r,n);return n},nS=(e,t,r,n,o,i)=>{var a,l,s,c,u,d=7&t,p=!!(8&t),h=!!(16&t),f=d>3?e.length+1:d?p?1:2:0,v=nb[d+5],g=d>3&&(e[f-1]=[]),m=e[f]||(e[f]=[]),_=d&&(h||p||(o=o.prototype),d<5&&(d>3||!h)&&nd(d<4?o:{get[r](){return nz(this,i)},set[r](x){return nC(this,i,x)}},r));d?h&&d<4&&n_(i,(d>2?"set ":d>1?"get ":"")+r):n_(o,r);for(var b=n.length-1;b>=0;b--)c=ny(d,r,s={},e[3],m),d&&(c.static=p,c.private=h,u=c.access={has:h?e=>nj(o,e):e=>r in e},3^d&&(u.get=h?e=>(1^d?nz:nA)(e,o,4^d?i:_.get):e=>e[r]),d>2&&(u.set=h?(e,t)=>nC(e,o,t,4^d?i:_.set):(e,t)=>e[r]=t)),l=(0,n[b])(d?d<4?h?i:_[v]:d>4?void 0:{get:_.get,set:_.set}:o,c),s._=1,4^d||void 0===l?nx(l)&&(d>4?g.unshift(l):d?h?i=l:_[v]=l:o=l):"object"!=typeof l||null===l?ng("Object expected"):(nx(a=l.get)&&(_.get=a),nx(a=l.set)&&(_.set=a),nx(a=l.init)&&g.unshift(a));return d||nk(e,o),_&&nc(o,r,_),h?4^d?i:_:o},nI=(e,t,r)=>t.has(e)||ng("Cannot "+r),nj=(e,t)=>Object(t)!==t?ng('Cannot use the "in" operator on this value'):e.has(t),nz=(e,t,r)=>(nI(e,t,"read from private field"),r?r.call(e):t.get(e)),nE=(e,t,r)=>t.has(e)?ng("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,r),nC=(e,t,r,n)=>(nI(e,t,"write to private field"),n?n.call(e,r):t.set(e,r),r),nA=(e,t,r)=>(nI(e,t,"access private method"),r);function nP(e,t){if(t){let r;return new nr(()=>{let n=e();return n&&r&&t(r,n)?r:(r=n,n)},void 0)}return new nr(e,void 0)}function nM(e,t){if(Object.is(e,t))return!0;if(null===e||null===t)return!1;if("function"==typeof e&&"function"==typeof t)return e===t;if(e instanceof Set&&t instanceof Set){if(e.size!==t.size)return!1;for(let r of e)if(!t.has(r))return!1;return!0}if(Array.isArray(e))return!!Array.isArray(t)&&e.length===t.length&&!e.some((e,r)=>!nM(e,t[r]));if("object"==typeof e&&"object"==typeof t){let r=Object.keys(e),n=Object.keys(t);return r.length===n.length&&!r.some(r=>!nM(e[r],t[r]))}return!1}function nO({get:e},t){return{init:e=>r9(e),get(){return e.call(this).value},set(t){let r=e.call(this);r.peek()!==t&&(r.value=t)}}}function nD(e,t){let r=new WeakMap;return function(){let t=r.get(this);return t||(t=nP(e.bind(this)),r.set(this,t)),t.value}}function nT(e=!0){return function(t,r){r.addInitializer(function(){let t="field"===r.kind||r.static?this:Object.getPrototypeOf(this),n=Object.getOwnPropertyDescriptor(t,r.name);n&&Object.defineProperty(t,r.name,nu(((e,t)=>{for(var r in t||(t={}))nf.call(t,r)&&nm(e,r,t[r]);if(nh)for(var r of nh(t))nv.call(t,r)&&nm(e,r,t[r]);return e})({},n),np({enumerable:e})))})}}function nN(...e){let t=e.map(e=>nl(e));return()=>t.forEach(e=>e())}w=[nO],k=[nO],y=[nO],b=[nT()],_=[nT()],m=[nT()];var nL=class{constructor(e,t=Object.is){this.defaultValue=e,this.equals=t,nw(S,5,this),nE(this,C),nE(this,I,nw(S,8,this)),nw(S,11,this),nE(this,A,nw(S,12,this)),nw(S,15,this),nE(this,D,nw(S,16,this)),nw(S,19,this),this.reset=this.reset.bind(this),this.reset()}get current(){return nz(this,C,N)}get initial(){return nz(this,C,z)}get previous(){return nz(this,C,M)}set current(e){let t=rG(()=>nz(this,C,N));e&&t&&this.equals(t,e)||rX(()=>{nz(this,C,z)||nC(this,C,e,E),nC(this,C,t,O),nC(this,C,e,L)})}reset(e=this.defaultValue){rX(()=>{nC(this,C,void 0,O),nC(this,C,e,E),nC(this,C,e,L)})}};function nB(e){return rG(()=>{let t={};for(let r in e)t[r]=e[r];return t})}S=[,,,ns(null)],I=new WeakMap,C=new WeakSet,A=new WeakMap,D=new WeakMap,z=(j=nS(S,20,"#initial",w,C,I)).get,E=j.set,M=(P=nS(S,20,"#previous",k,C,A)).get,O=P.set,N=(T=nS(S,20,"#current",y,C,D)).get,L=T.set,nS(S,2,"current",b,nL),nS(S,2,"initial",_,nL),nS(S,2,"previous",m,nL),nk(S,nL);var nR=class{constructor(){nE(this,B,new WeakMap)}get(e,t){var r;return e?null==(r=nz(this,B).get(e))?void 0:r.get(t):void 0}set(e,t,r){var n;if(e)return nz(this,B).has(e)||nz(this,B).set(e,new Map),null==(n=nz(this,B).get(e))?void 0:n.set(t,r)}clear(e){var t;return e?null==(t=nz(this,B).get(e))?void 0:t.clear():void 0}};B=new WeakMap;var nF=Object.create,nV=Object.defineProperty,n$=Object.getOwnPropertyDescriptor,nW=Object.getOwnPropertySymbols,nH=Object.prototype.hasOwnProperty,nq=Object.prototype.propertyIsEnumerable,nU=(e,t)=>(t=Symbol[e])?t:Symbol.for("Symbol."+e),nZ=e=>{throw TypeError(e)},nY=Math.pow,nX=(e,t,r)=>t in e?nV(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,nK=(e,t)=>nV(e,"name",{value:t,configurable:!0}),nJ=["class","method","getter","setter","accessor","field","value","get","set"],nG=e=>void 0!==e&&"function"!=typeof e?nZ("Function expected"):e,nQ=(e,t,r,n,o)=>({kind:nJ[e],name:t,metadata:n,addInitializer:e=>r._?nZ("Already initialized"):o.push(nG(e||null))}),n0=(e,t)=>nX(t,nU("metadata"),e[3]),n1=(e,t,r,n,o,i)=>{var a,l,s,c,u,d=7&t,p=!!(8&t),h=!!(16&t),f=d>3?e.length+1:d?p?1:2:0,v=nJ[d+5],g=d>3&&(e[f-1]=[]),m=e[f]||(e[f]=[]),_=d&&(h||p||(o=o.prototype),d<5&&(d>3||!h)&&n$(d<4?o:{get[r](){return n3(this,i)},set[r](x){return n6(this,i,x)}},r));d?h&&d<4&&nK(i,(d>2?"set ":d>1?"get ":"")+r):nK(o,r);for(var b=n.length-1;b>=0;b--)c=nQ(d,r,s={},e[3],m),d&&(c.static=p,c.private=h,u=c.access={has:h?e=>n4(o,e):e=>r in e},3^d&&(u.get=h?e=>(1^d?n3:n5)(e,o,4^d?i:_.get):e=>e[r]),d>2&&(u.set=h?(e,t)=>n6(e,o,t,4^d?i:_.set):(e,t)=>e[r]=t)),l=(0,n[b])(d?d<4?h?i:_[v]:d>4?void 0:{get:_.get,set:_.set}:o,c),s._=1,4^d||void 0===l?nG(l)&&(d>4?g.unshift(l):d?h?i=l:_[v]=l:o=l):"object"!=typeof l||null===l?nZ("Object expected"):(nG(a=l.get)&&(_.get=a),nG(a=l.set)&&(_.set=a),nG(a=l.init)&&g.unshift(a));return d||n0(e,o),_&&nV(o,r,_),h?4^d?i:_:o},n2=(e,t,r)=>t.has(e)||nZ("Cannot "+r),n4=(e,t)=>Object(t)!==t?nZ('Cannot use the "in" operator on this value'):e.has(t),n3=(e,t,r)=>(n2(e,t,"read from private field"),r?r.call(e):t.get(e)),n6=(e,t,r,n)=>(n2(e,t,"write to private field"),n?n.call(e,r):t.set(e,r),r),n5=(e,t,r)=>(n2(e,t,"access private method"),r),n8=class e{constructor(e,t){this.x=e,this.y=t}static delta(t,r){return new e(t.x-r.x,t.y-r.y)}static distance(e,t){return Math.hypot(e.x-t.x,e.y-t.y)}static equals(e,t){return e.x===t.x&&e.y===t.y}static from({x:t,y:r}){return new e(t,r)}},n9=class e{constructor(e,t,r,n){this.left=e,this.top=t,this.width=r,this.height=n,this.scale={x:1,y:1}}get inverseScale(){return{x:1/this.scale.x,y:1/this.scale.y}}translate(t,r){let{top:n,left:o,width:i,height:a,scale:l}=this,s=new e(o+t,n+r,i,a);return s.scale=((e,t)=>{for(var r in t||(t={}))nH.call(t,r)&&nX(e,r,t[r]);if(nW)for(var r of nW(t))nq.call(t,r)&&nX(e,r,t[r]);return e})({},l),s}get boundingRectangle(){let{width:e,height:t,left:r,top:n,right:o,bottom:i}=this;return{width:e,height:t,left:r,top:n,right:o,bottom:i}}get center(){let{left:e,top:t,right:r,bottom:n}=this;return new n8((e+r)/2,(t+n)/2)}get area(){let{width:e,height:t}=this;return e*t}equals(t){if(!(t instanceof e))return!1;let{left:r,top:n,width:o,height:i}=this;return r===t.left&&n===t.top&&o===t.width&&i===t.height}containsPoint(e){let{top:t,left:r,bottom:n,right:o}=this;return t<=e.y&&e.y<=n&&r<=e.x&&e.x<=o}intersectionArea(t){var r,n;let o,i,a,l;return t instanceof e?(r=this,o=Math.max((n=t).top,r.top),i=Math.max(n.left,r.left),a=Math.min(n.left+n.width,r.left+r.width),l=Math.min(n.top+n.height,r.top+r.height),i<a&&o<l?(a-i)*(l-o):0):0}intersectionRatio(e){let{area:t}=this,r=this.intersectionArea(e);return r/(e.area+t-r)}get bottom(){let{top:e,height:t}=this;return e+t}get right(){let{left:e,width:t}=this;return e+t}get aspectRatio(){let{width:e,height:t}=this;return e/t}get corners(){return[{x:this.left,y:this.top},{x:this.right,y:this.top},{x:this.left,y:this.bottom},{x:this.right,y:this.bottom}]}static from({top:t,left:r,width:n,height:o}){return new e(r,t,n,o)}static delta(e,t,r={x:"center",y:"center"}){let n=(e,t)=>{let n=r[t],o="x"===t?e.left:e.top,i="x"===t?e.width:e.height;return"start"==n?o:"end"==n?o+i:o+i/2};return n8.delta({x:n(e,"x"),y:n(e,"y")},{x:n(t,"x"),y:n(t,"y")})}static intersectionRatio(t,r){return e.from(t).intersectionRatio(e.from(r))}},n7=class extends(V=nL,F=[nD],R=[nD],V){constructor(e){super(n8.from(e),(e,t)=>n8.equals(e,t)),((e,t)=>{for(var r=0,n=e[2],o=n&&n.length;r<o;r++)n[r].call(t)})(W,this),((e,t)=>t.has(e)?nZ("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,0))(this,$),this.velocity={x:0,y:0}}get delta(){return n8.delta(this.current,this.initial)}get direction(){let{current:e,previous:t}=this;if(!t)return null;let r={x:e.x-t.x,y:e.y-t.y};return r.x||r.y?Math.abs(r.x)>Math.abs(r.y)?r.x>0?"right":"left":r.y>0?"down":"up":null}get current(){return super.current}set current(e){let{current:t}=this,r=n8.from(e),n={x:r.x-t.x,y:r.y-t.y},o=Date.now(),i=o-n3(this,$),a=e=>Math.round(e/i*100);rX(()=>{n6(this,$,o),this.velocity={x:a(n.x),y:a(n.y)},super.current=r})}reset(e=this.defaultValue){super.reset(n8.from(e)),this.velocity={x:0,y:0}}};function oe({x:e,y:t},r){let n=Math.abs(e),o=Math.abs(t);return"number"==typeof r?Math.sqrt(nY(n,2)+nY(o,2))>r:"x"in r&&"y"in r?n>r.x&&o>r.y:"x"in r?n>r.x:"y"in r&&o>r.y}W=[,,,nF(null!=(l=null==V?void 0:V[nU("metadata")])?l:null)],$=new WeakMap,n1(W,2,"delta",F,n7),n1(W,2,"direction",R,n7),n0(W,n7);var ot=((s=ot||{}).Horizontal="x",s.Vertical="y",s),or=Object.values(ot),on=Object.create,oo=Object.defineProperty,oi=Object.defineProperties,oa=Object.getOwnPropertyDescriptor,ol=Object.getOwnPropertyDescriptors,os=Object.getOwnPropertySymbols,oc=Object.prototype.hasOwnProperty,ou=Object.prototype.propertyIsEnumerable,od=(e,t)=>(t=Symbol[e])?t:Symbol.for("Symbol."+e),op=e=>{throw TypeError(e)},oh=(e,t,r)=>t in e?oo(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,of=(e,t)=>{for(var r in t||(t={}))oc.call(t,r)&&oh(e,r,t[r]);if(os)for(var r of os(t))ou.call(t,r)&&oh(e,r,t[r]);return e},ov=(e,t)=>oi(e,ol(t)),og=(e,t)=>oo(e,"name",{value:t,configurable:!0}),om=(e,t)=>{var r={};for(var n in e)oc.call(e,n)&&0>t.indexOf(n)&&(r[n]=e[n]);if(null!=e&&os)for(var n of os(e))0>t.indexOf(n)&&ou.call(e,n)&&(r[n]=e[n]);return r},o_=e=>{var t;return[,,,on(null!=(t=null==e?void 0:e[od("metadata")])?t:null)]},ob=["class","method","getter","setter","accessor","field","value","get","set"],ox=e=>void 0!==e&&"function"!=typeof e?op("Function expected"):e,oy=(e,t,r,n,o)=>({kind:ob[e],name:t,metadata:n,addInitializer:e=>r._?op("Already initialized"):o.push(ox(e||null))}),ok=(e,t)=>oh(t,od("metadata"),e[3]),ow=(e,t,r,n)=>{for(var o=0,i=e[t>>1],a=i&&i.length;o<a;o++)1&t?i[o].call(r):n=i[o].call(r,n);return n},oS=(e,t,r,n,o,i)=>{var a,l,s,c,u,d=7&t,p=!!(8&t),h=!!(16&t),f=d>3?e.length+1:d?p?1:2:0,v=ob[d+5],g=d>3&&(e[f-1]=[]),m=e[f]||(e[f]=[]),_=d&&(h||p||(o=o.prototype),d<5&&(d>3||!h)&&oa(d<4?o:{get[r](){return oz(this,i)},set[r](x){return oC(this,i,x)}},r));d?h&&d<4&&og(i,(d>2?"set ":d>1?"get ":"")+r):og(o,r);for(var b=n.length-1;b>=0;b--)c=oy(d,r,s={},e[3],m),d&&(c.static=p,c.private=h,u=c.access={has:h?e=>oj(o,e):e=>r in e},3^d&&(u.get=h?e=>(1^d?oz:oA)(e,o,4^d?i:_.get):e=>e[r]),d>2&&(u.set=h?(e,t)=>oC(e,o,t,4^d?i:_.set):(e,t)=>e[r]=t)),l=(0,n[b])(d?d<4?h?i:_[v]:d>4?void 0:{get:_.get,set:_.set}:o,c),s._=1,4^d||void 0===l?ox(l)&&(d>4?g.unshift(l):d?h?i=l:_[v]=l:o=l):"object"!=typeof l||null===l?op("Object expected"):(ox(a=l.get)&&(_.get=a),ox(a=l.set)&&(_.set=a),ox(a=l.init)&&g.unshift(a));return d||ok(e,o),_&&oo(o,r,_),h?4^d?i:_:o},oI=(e,t,r)=>t.has(e)||op("Cannot "+r),oj=(e,t)=>Object(t)!==t?op('Cannot use the "in" operator on this value'):e.has(t),oz=(e,t,r)=>(oI(e,t,"read from private field"),r?r.call(e):t.get(e)),oE=(e,t,r)=>t.has(e)?op("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,r),oC=(e,t,r,n)=>(oI(e,t,"write to private field"),n?n.call(e,r):t.set(e,r),r),oA=(e,t,r)=>(oI(e,t,"access private method"),r);function oP(e,t){return{plugin:e,options:t}}function oM(e){return t=>oP(e,t)}function oO(e){return"function"==typeof e?{plugin:e,options:void 0}:e}H=[nO];var oD=class{constructor(e,t){this.manager=e,this.options=t,oE(this,U,ow(q,8,this,!1)),ow(q,11,this),oE(this,Z,new Set)}enable(){this.disabled=!1}disable(){this.disabled=!0}isDisabled(){return rG(()=>this.disabled)}configure(e){this.options=e}registerEffect(e){let t=nl(e.bind(this));return oz(this,Z).add(t),t}destroy(){oz(this,Z).forEach(e=>e())}static configure(e){return oP(this,e)}};q=o_(null),U=new WeakMap,Z=new WeakMap,oS(q,4,"disabled",H,oD,U),ok(q,oD);var oT=class extends oD{},oN=class{constructor(e){this.manager=e,this.instances=new Map,oE(this,Y,[])}get values(){return Array.from(this.instances.values())}set values(e){let t=e.map(oO).reduce((e,t)=>{let r=e.find(({plugin:e})=>e===t.plugin);return r?(r.options=t.options,e):[...e,t]},[]),r=t.map(({plugin:e})=>e);for(let e of oz(this,Y))if(!r.includes(e)){if(e.prototype instanceof oT)continue;this.unregister(e)}for(let{plugin:e,options:r}of t)this.register(e,r);oC(this,Y,r)}get(e){return this.instances.get(e)}register(e,t){let r=this.instances.get(e);if(r)return r.options!==t&&(r.options=t),r;let n=new e(this.manager,t);return this.instances.set(e,n),n}unregister(e){let t=this.instances.get(e);t&&(t.destroy(),this.instances.delete(e))}destroy(){for(let e of this.instances.values())e.destroy();this.instances.clear()}};function oL(e,t){return e.priority===t.priority?e.type===t.type?t.value-e.value:t.type-e.type:t.priority-e.priority}Y=new WeakMap;var oB=[],oR=class extends oD{constructor(e){super(e),oE(this,X),oE(this,K),this.computeCollisions=this.computeCollisions.bind(this),oC(this,K,r9(oB)),this.destroy=nN(()=>{let e=this.computeCollisions(),t=rG(()=>this.manager.dragOperation.position.current);if(e!==oB){let e=oz(this,X);if(oC(this,X,t),e&&t.x==e.x&&t.y==e.y)return}else oC(this,X,void 0);oz(this,K).value=e},()=>{let{dragOperation:e}=this.manager;e.status.initialized&&this.forceUpdate()})}forceUpdate(e=!0){rG(()=>{e?oz(this,K).value=this.computeCollisions():oC(this,X,void 0)})}computeCollisions(e,t){let{registry:r,dragOperation:n}=this.manager,{source:o,shape:i,status:a}=n;if(!a.initialized||!i)return oB;let l=[],s=[];for(let i of null!=e?e:r.droppables){if(i.disabled||o&&!i.accepts(o))continue;let e=null!=t?t:i.collisionDetector;if(!e)continue;s.push(i),i.shape;let r=rG(()=>e({droppable:i,dragOperation:n}));r&&(null!=i.collisionPriority&&(r.priority=i.collisionPriority),l.push(r))}return 0===s.length?oB:(l.sort(oL),l)}get collisions(){return oz(this,K).value}};X=new WeakMap,K=new WeakMap,Q=[nO],G=[nO],J=[nO];var oF=class e{constructor(e,t){oE(this,en,ow(er,8,this)),ow(er,11,this),oE(this,eo),oE(this,ei,ow(er,12,this)),ow(er,15,this),oE(this,ea,ow(er,16,this)),ow(er,19,this);const{effects:r,id:n,data:o={},disabled:i=!1,register:a=!0}=e;let l=n;oC(this,eo,r9(n)),this.manager=t,this.data=o,this.disabled=i,this.effects=()=>{var e;return[()=>{let{id:e,manager:t}=this;if(e!==l)return l=e,null==t||t.registry.register(this),()=>null==t?void 0:t.registry.unregister(this)},...null!=(e=null==r?void 0:r())?e:[]]},this.register=this.register.bind(this),this.unregister=this.unregister.bind(this),this.destroy=this.destroy.bind(this),t&&a&&queueMicrotask(this.register)}get id(){var t,r;let n=oz(this,eo).value;return null!=(r=null==(t=e.pendingIdChanges)?void 0:t.get(this))?r:n}set id(t){var r,n;t!==(null!=(n=null==(r=e.pendingIdChanges)?void 0:r.get(this))?n:oz(this,eo).peek())&&(e.pendingIdChanges||(e.pendingIdChanges=new Map,queueMicrotask(()=>oA(e,ee,et).call(e))),e.pendingIdChanges.set(this,t))}register(){var e;return null==(e=this.manager)?void 0:e.registry.register(this)}unregister(){var e;null==(e=this.manager)||e.registry.unregister(this)}destroy(){var e;null==(e=this.manager)||e.registry.unregister(this)}};er=o_(null),ee=new WeakSet,et=function(){let e=oF.pendingIdChanges;oF.pendingIdChanges=null,e&&rX(()=>{for(let[t,r]of e)oz(t,eo).value=r})},en=new WeakMap,eo=new WeakMap,ei=new WeakMap,ea=new WeakMap,oS(er,4,"manager",Q,oF,en),oS(er,4,"data",G,oF,ei),oS(er,4,"disabled",J,oF,ea),oE(oF,ee),ok(er,oF),oF.pendingIdChanges=null;var oV=oF,o$=class{constructor(){this.map=r9(new Map),this.cleanupFunctions=new WeakMap,this.register=(e,t)=>{let r=this.map.peek(),n=r.get(e),o=()=>this.unregister(e,t);if(n===t)return o;if(n&&n.id===e){let e=this.cleanupFunctions.get(n);null==e||e(),this.cleanupFunctions.delete(n)}let i=new Map(r);for(let[n,o]of r)if(o===t&&n!==e){i.delete(n);break}i.set(e,t),this.map.value=i;let a=nN(...t.effects());return this.cleanupFunctions.set(t,a),o},this.unregister=(e,t)=>{let r=this.map.peek();if(r.get(e)!==t)return;let n=this.cleanupFunctions.get(t);null==n||n(),this.cleanupFunctions.delete(t);let o=new Map(r);o.delete(e),this.map.value=o}}[Symbol.iterator](){return this.map.peek().values()}get value(){return this.map.value.values()}has(e){return this.map.value.has(e)}get(e){return this.map.value.get(e)}destroy(){for(let e of this){let t=this.cleanupFunctions.get(e);null==t||t(),e.destroy()}this.map.value=new Map}},oW=class extends(eh=oV,ep=[nO],ed=[nO],eu=[nO],ec=[nD],es=[nD],el=[nD],eh){constructor(e,t){var{modifiers:r,type:n,sensors:o,plugins:i,effects:a}=e,l=om(e,["modifiers","type","sensors","plugins","effects"]);super(ov(of({},l),{effects:()=>{var e;return[...null!=(e=null==a?void 0:a())?e:[],()=>{let{manager:e,plugins:t}=this;if(e&&t)for(let r of t){let{plugin:t}=oO(r);e.registry.plugins.register(t)}}]}}),t),ow(ef,5,this),oE(this,ev,ow(ef,8,this)),ow(ef,11,this),oE(this,eg,ow(ef,12,this)),ow(ef,15,this),oE(this,em,ow(ef,16,this,this.isDragSource?"dragging":"idle")),ow(ef,19,this),this.type=n,this.sensors=o,this.modifiers=r,this.alignment=l.alignment,this.plugins=i}pluginConfig(e){if(this.plugins)for(let t of this.plugins){let r=oO(t);if(r.plugin===e)return r.options}}get isDropping(){return"dropping"===this.status&&this.isDragSource}get isDragging(){return"dragging"===this.status&&this.isDragSource}get isDragSource(){var e,t;return(null==(t=null==(e=this.manager)?void 0:e.dragOperation.source)?void 0:t.id)===this.id}};ef=o_(eh),ev=new WeakMap,eg=new WeakMap,em=new WeakMap,oS(ef,4,"type",ep,oW,ev),oS(ef,4,"modifiers",ed,oW,eg),oS(ef,4,"status",eu,oW,em),oS(ef,2,"isDropping",ec,oW),oS(ef,2,"isDragging",es,oW),oS(ef,2,"isDragSource",el,oW),ok(ef,oW);var oH=class extends(eS=oV,ew=[nO],ek=[nO],ey=[nO],ex=[nO],eb=[nO],e_=[nD],eS){constructor(e,t){var{accept:r,collisionDetector:n,collisionPriority:o,type:i}=e;super(om(e,["accept","collisionDetector","collisionPriority","type"]),t),ow(eI,5,this),oE(this,ej,ow(eI,8,this)),ow(eI,11,this),oE(this,ez,ow(eI,12,this)),ow(eI,15,this),oE(this,eE,ow(eI,16,this)),ow(eI,19,this),oE(this,eC,ow(eI,20,this)),ow(eI,23,this),oE(this,eA,ow(eI,24,this)),ow(eI,27,this),this.accept=r,this.collisionDetector=n,this.collisionPriority=o,this.type=i}accepts(e){let{accept:t}=this;return!t||("function"==typeof t?t(e):!!e.type&&(Array.isArray(t)?t.includes(e.type):e.type===t))}get isDropTarget(){var e,t;return(null==(t=null==(e=this.manager)?void 0:e.dragOperation.target)?void 0:t.id)===this.id}};eI=o_(eS),ej=new WeakMap,ez=new WeakMap,eE=new WeakMap,eC=new WeakMap,eA=new WeakMap,oS(eI,4,"accept",ew,oH,ej),oS(eI,4,"type",ek,oH,ez),oS(eI,4,"collisionDetector",ey,oH,eE),oS(eI,4,"collisionPriority",ex,oH,eC),oS(eI,4,"shape",eb,oH,eA),oS(eI,2,"isDropTarget",e_,oH),ok(eI,oH);var oq=class{constructor(){this.registry=new Map}addEventListener(e,t){let{registry:r}=this,n=new Set(r.get(e));return n.add(t),r.set(e,n),()=>this.removeEventListener(e,t)}removeEventListener(e,t){let{registry:r}=this,n=new Set(r.get(e));n.delete(t),r.set(e,n)}dispatch(e,...t){let{registry:r}=this,n=r.get(e);if(n)for(let e of n)e(...t)}},oU=class extends oq{constructor(e){super(),this.manager=e}dispatch(e,t){let r=[t,this.manager];super.dispatch(e,...r)}};function oZ(e,t=!0){let r=!1;return ov(of({},e),{cancelable:t,get defaultPrevented(){return r},preventDefault(){t&&(r=!0)}})}var oY=class extends oT{constructor(e){super(e);let t=[];this.destroy=nN(()=>{let{dragOperation:r,collisionObserver:n}=e;r.status.initializing&&(t=[],n.enable())},()=>{let r,{collisionObserver:n,monitor:o}=e,{collisions:i}=n;if(n.isDisabled()||oV.pendingIdChanges)return;let a=oZ({collisions:i});if(o.dispatch("collision",a),a.defaultPrevented||(r=t,i.map(({id:e})=>e).join("")===r.map(({id:e})=>e).join("")))return;t=i;let[l]=i;rG(()=>{var t;(null==l?void 0:l.id)!==(null==(t=e.dragOperation.target)?void 0:t.id)&&(n.disable(),e.actions.setDropTarget(null==l?void 0:l.id).then(()=>{n.enable()}))})})}},oX=((c=oX||{})[c.Lowest=0]="Lowest",c[c.Low=1]="Low",c[c.Normal=2]="Normal",c[c.High=3]="High",c[c.Highest=4]="Highest",c),oK=((u=oK||{})[u.Collision=0]="Collision",u[u.ShapeIntersection=1]="ShapeIntersection",u[u.PointerIntersection=2]="PointerIntersection",u);eL=[nO],eN=[nD],eT=[nD],eD=[nD],eO=[nD],eM=[nD],eP=[nD];var oJ=class{constructor(){ow(eB,5,this),oE(this,eR,ow(eB,8,this,"idle")),ow(eB,11,this)}get current(){return this.value}get idle(){return"idle"===this.value}get initializing(){return"initializing"===this.value}get initialized(){let{value:e}=this;return"idle"!==e&&"initialization-pending"!==e}get dragging(){return"dragging"===this.value}get dropped(){return"dropped"===this.value}set(e){this.value=e}};eB=o_(null),eR=new WeakMap,oS(eB,4,"value",eL,oJ,eR),oS(eB,2,"current",eN,oJ),oS(eB,2,"idle",eT,oJ),oS(eB,2,"initializing",eD,oJ),oS(eB,2,"initialized",eO,oJ),oS(eB,2,"dragging",eM,oJ),oS(eB,2,"dropped",eP,oJ),ok(eB,oJ);var oG=class{constructor(e){this.manager=e}setDragSource(e){let{dragOperation:t}=this.manager;t.sourceIdentifier="string"==typeof e||"number"==typeof e?e:e.id}setDropTarget(e){return rG(()=>{let{dragOperation:t}=this.manager,r=null!=e?e:null;if(t.targetIdentifier===r)return Promise.resolve(!1);t.targetIdentifier=r;let n=oZ({operation:t.snapshot()});return t.status.dragging&&this.manager.monitor.dispatch("dragover",n),this.manager.renderer.rendering.then(()=>n.defaultPrevented)})}start(e){return rG(()=>{let{dragOperation:t}=this.manager;if(null!=e.source&&this.setDragSource(e.source),!t.source)throw Error("Cannot start a drag operation without a drag source");if(!t.status.idle)throw Error("Cannot start a drag operation while another is active");let r=new AbortController,{event:n,coordinates:o}=e;rX(()=>{t.status.set("initialization-pending"),t.shape=null,t.canceled=!1,t.activatorEvent=null!=n?n:null,t.position.reset(o)});let i=oZ({operation:t.snapshot()});return(this.manager.monitor.dispatch("beforedragstart",i),i.defaultPrevented)?(t.reset(),r.abort()):(t.status.set("initializing"),t.controller=r,this.manager.renderer.rendering.then(()=>{if(r.signal.aborted)return;let{status:e}=t;"initializing"===e.current&&rX(()=>{t.status.set("dragging"),this.manager.monitor.dispatch("dragstart",{nativeEvent:n,operation:t.snapshot(),cancelable:!1})})})),r})}move(e){return rG(()=>{var t,r;let{dragOperation:n}=this.manager,{status:o,controller:i}=n;if(!o.dragging||!i||i.signal.aborted)return;let a=oZ({nativeEvent:e.event,operation:n.snapshot(),by:e.by,to:e.to},null==(t=e.cancelable)||t);(null==(r=e.propagate)||r)&&this.manager.monitor.dispatch("dragmove",a),queueMicrotask(()=>{var t,r,o,i,l;if(a.defaultPrevented)return;let s=null!=(l=e.to)?l:{x:n.position.current.x+(null!=(r=null==(t=e.by)?void 0:t.x)?r:0),y:n.position.current.y+(null!=(i=null==(o=e.by)?void 0:o.y)?i:0)};n.position.current=s})})}stop(e={}){return rG(()=>{var t,r;let n,{dragOperation:o}=this.manager,{controller:i}=o;if(!i||i.signal.aborted)return;i.abort();let a=()=>{this.manager.renderer.rendering.then(()=>{o.status.set("dropped");let e=rG(()=>{var e;return(null==(e=o.source)?void 0:e.status)==="dropping"}),t=()=>{o.controller===i&&(o.controller=void 0),o.reset()};if(e){let{source:e}=o,r=nl(()=>{(null==e?void 0:e.status)==="idle"&&(r(),t())})}else this.manager.renderer.rendering.then(t)})};o.canceled=null!=(t=e.canceled)&&t,this.manager.monitor.dispatch("dragend",{nativeEvent:e.event,operation:o.snapshot(),canceled:null!=(r=e.canceled)&&r,suspend:()=>{let e={resume:()=>{},abort:()=>{}};return n=new Promise((t,r)=>{e.resume=t,e.abort=r}),e}}),n?n.then(a).catch(()=>o.reset()):a()})}},oQ=class extends oD{constructor(e,t){super(e,t),this.manager=e,this.options=t}},o0=class extends AbortController{constructor(e,t){for(const r of(super(),this.constraints=e,this.onActivate=t,this.activated=!1,null!=e?e:[]))r.controller=this}onEvent(e){var t;if(!this.activated)if(null==(t=this.constraints)?void 0:t.length)for(let t of this.constraints)t.onEvent(e);else this.activate(e)}activate(e){this.activated||(this.activated=!0,this.onActivate(e))}abort(e){this.activated=!1,super.abort(e)}},o1=class{constructor(e){this.options=e,oE(this,eF)}set controller(e){oC(this,eF,e),e.signal.addEventListener("abort",()=>this.abort())}activate(e){var t;null==(t=oz(this,eF))||t.activate(e)}};eF=new WeakMap;var o2=class extends oD{constructor(e,t){super(e,t),this.manager=e,this.options=t}apply(e){return e.transform}},o4=class{constructor(e){this.draggables=new o$,this.droppables=new o$,this.plugins=new oN(e),this.sensors=new oN(e),this.modifiers=new oN(e)}register(e,t){if(e instanceof oW)return this.draggables.register(e.id,e);if(e instanceof oH)return this.droppables.register(e.id,e);if(e.prototype instanceof o2)return this.modifiers.register(e,t);if(e.prototype instanceof oQ)return this.sensors.register(e,t);if(e.prototype instanceof oD)return this.plugins.register(e,t);throw Error("Invalid instance type")}unregister(e){if(e instanceof oV)return e instanceof oW?this.draggables.unregister(e.id,e):e instanceof oH?this.droppables.unregister(e.id,e):()=>{};if(e.prototype instanceof o2)return this.modifiers.unregister(e);if(e.prototype instanceof oQ)return this.sensors.unregister(e);if(e.prototype instanceof oD)return this.plugins.unregister(e);throw Error("Invalid instance type")}destroy(){this.draggables.destroy(),this.droppables.destroy(),this.plugins.destroy(),this.sensors.destroy(),this.modifiers.destroy()}};eX=[nD],eY=[nO],eZ=[nO],eU=[nO],eq=[nO],eH=[nO],eW=[nD],e$=[nD],eV=[nD];var o3=class{constructor(e){ow(eQ,5,this),oE(this,eK),oE(this,eJ),oE(this,eG,new nL(void 0,(e,t)=>e&&t?e.equals(t):e===t)),this.status=new oJ,oE(this,e0,ow(eQ,8,this,!1)),ow(eQ,11,this),oE(this,e1,ow(eQ,12,this,null)),ow(eQ,15,this),oE(this,e2,ow(eQ,16,this,null)),ow(eQ,19,this),oE(this,e4,ow(eQ,20,this,null)),ow(eQ,23,this),oE(this,e3,ow(eQ,24,this,[])),ow(eQ,27,this),this.position=new n7({x:0,y:0}),oE(this,e6,{x:0,y:0}),oC(this,eK,e)}get shape(){let{current:e,initial:t,previous:r}=oz(this,eG);return e&&t?{current:e,initial:t,previous:r}:null}set shape(e){e?oz(this,eG).current=e:oz(this,eG).reset()}get source(){var e;let t=this.sourceIdentifier;if(null==t)return null;let r=oz(this,eK).registry.draggables.get(t);return r&&oC(this,eJ,r),null!=(e=null!=r?r:oz(this,eJ))?e:null}get target(){var e;let t=this.targetIdentifier;return null!=t&&null!=(e=oz(this,eK).registry.droppables.get(t))?e:null}get transform(){let{x:e,y:t}=this.position.delta,r={x:e,y:t};for(let e of this.modifiers)r=e.apply(ov(of({},this.snapshot()),{transform:r}));return oC(this,e6,r),r}snapshot(){return rG(()=>({source:this.source,target:this.target,activatorEvent:this.activatorEvent,transform:oz(this,e6),shape:this.shape?nB(this.shape):null,position:nB(this.position),status:nB(this.status),canceled:this.canceled}))}reset(){rX(()=>{this.status.set("idle"),this.sourceIdentifier=null,this.targetIdentifier=null,oz(this,eG).reset(),this.position.reset({x:0,y:0}),oC(this,e6,{x:0,y:0}),this.modifiers=[]})}};eQ=o_(null),eK=new WeakMap,eJ=new WeakMap,eG=new WeakMap,e0=new WeakMap,e1=new WeakMap,e2=new WeakMap,e4=new WeakMap,e3=new WeakMap,e6=new WeakMap,oS(eQ,2,"shape",eX,o3),oS(eQ,4,"canceled",eY,o3,e0),oS(eQ,4,"activatorEvent",eZ,o3,e1),oS(eQ,4,"sourceIdentifier",eU,o3,e2),oS(eQ,4,"targetIdentifier",eq,o3,e4),oS(eQ,4,"modifiers",eH,o3,e3),oS(eQ,2,"source",eW,o3),oS(eQ,2,"target",e$,o3),oS(eQ,2,"transform",eV,o3),ok(eQ,o3);var o6={get rendering(){return Promise.resolve()}};function o5(e,t){return"function"==typeof e?e(t):null!=e?e:t}var o8=class{constructor(e){var t;this.destroy=()=>{this.dragOperation.status.idle||this.actions.stop({canceled:!0}),this.dragOperation.modifiers.forEach(e=>e.destroy()),this.registry.destroy(),this.collisionObserver.destroy()};const r=null!=e?e:{},n=o5(r.plugins,[]),o=o5(r.sensors,[]),i=o5(r.modifiers,[]),a=null!=(t=r.renderer)?t:o6,l=new oU(this),s=new o4(this);this.registry=s,this.monitor=l,this.renderer=a,this.actions=new oG(this),this.dragOperation=new o3(this),this.collisionObserver=new oR(this),this.plugins=[oY,...n],this.modifiers=i,this.sensors=o;const{destroy:c}=this,u=nN(()=>{var e,t,r;let n=rG(()=>this.dragOperation.modifiers),o=this.modifiers;for(let e of n)o.includes(e)||e.destroy();this.dragOperation.modifiers=null!=(r=null==(t=null==(e=this.dragOperation.source)?void 0:e.modifiers)?void 0:t.map(e=>{let{plugin:t,options:r}=oO(e);return new t(this,r)}))?r:o});this.destroy=()=>{u(),c()}}get plugins(){return this.registry.plugins.values}set plugins(e){this.registry.plugins.values=e}get modifiers(){return this.registry.modifiers.values}set modifiers(e){this.registry.modifiers.values=e}get sensors(){return this.registry.sensors.values}set sensors(e){this.registry.sensors.values=e}},o9=e=>{throw TypeError(e)},o7=(e,t,r)=>t.has(e)||o9("Cannot "+r),ie=(e,t,r)=>(o7(e,t,"read from private field"),t.get(e)),it=(e,t,r)=>t.has(e)?o9("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,r),ir=(e,t,r,n)=>(o7(e,t,"write to private field"),t.set(e,r),r),io=(e,t,r)=>(o7(e,t,"access private method"),r);function ii(e){return!!e&&(e instanceof KeyframeEffect||"getKeyframes"in e&&"function"==typeof e.getKeyframes)}function ia(e,t){let r=e.getAnimations(),n=null;for(let e of r){if("running"!==e.playState)continue;let{effect:r}=e,o=(ii(r)?r.getKeyframes():[]).filter(t);o.length>0&&(n=[o[o.length-1],e])}return n}function il(e){let{width:t,height:r,top:n,left:o,bottom:i,right:a}=e.getBoundingClientRect();return{width:t,height:r,top:n,left:o,bottom:i,right:a}}function is(e){let t=Object.prototype.toString.call(e);return"[object Window]"===t||"[object global]"===t}function ic(e){return"nodeType"in e}function iu(e){var t,r,n;return e?is(e)?e:ic(e)?"defaultView"in e?null!=(t=e.defaultView)?t:window:null!=(n=null==(r=e.ownerDocument)?void 0:r.defaultView)?n:window:window:window}function id(e){let{Document:t}=iu(e);return e instanceof t||"nodeType"in e&&e.nodeType===Node.DOCUMENT_NODE}function ip(e){return!(!e||is(e))&&(e instanceof iu(e).HTMLElement||"namespaceURI"in e&&"string"==typeof e.namespaceURI&&e.namespaceURI.endsWith("html"))}function ih(e){return e instanceof iu(e).SVGElement||"namespaceURI"in e&&"string"==typeof e.namespaceURI&&e.namespaceURI.endsWith("svg")}function iv(e){return e?is(e)?e.document:ic(e)?id(e)?e:ip(e)||ih(e)?e.ownerDocument:document:document:document}function ig(e,t=e.getBoundingClientRect(),r=0){var n,o,i,a,l;let s=t,{ownerDocument:c}=e,u=null!=(n=c.defaultView)?n:window,d=e.parentElement;for(;d&&d!==c.documentElement;){if(!function(e){if("DETAILS"===e.tagName&&!1===e.open)return!1;let{overflow:t,overflowX:r,overflowY:n}=getComputedStyle(e);return"visible"===t&&"visible"===r&&"visible"===n}(d)){let e=d.getBoundingClientRect(),t=r*(e.bottom-e.top),n=r*(e.right-e.left),o=r*(e.bottom-e.top),i=r*(e.right-e.left);(s={top:Math.max(s.top,e.top-t),right:Math.min(s.right,e.right+n),bottom:Math.min(s.bottom,e.bottom+o),left:Math.max(s.left,e.left-i),width:0,height:0}).width=s.right-s.left,s.height=s.bottom-s.top}d=d.parentElement}let p=u.visualViewport,h=null!=(o=null==p?void 0:p.offsetTop)?o:0,f=null!=(i=null==p?void 0:p.offsetLeft)?i:0,v=null!=(a=null==p?void 0:p.width)?a:u.innerWidth,g=null!=(l=null==p?void 0:p.height)?l:u.innerHeight,m=r*g,_=r*v;return(s={top:Math.max(s.top,h-m),right:Math.min(s.right,f+v+_),bottom:Math.min(s.bottom,h+g+m),left:Math.max(s.left,f-_),width:0,height:0}).width=s.right-s.left,s.height=s.bottom-s.top,s.width<0&&(s.width=0),s.height<0&&(s.height=0),s}function im(e){return{x:e.clientX,y:e.clientY}}var i_="u">typeof window&&void 0!==window.document&&void 0!==window.document.createElement;function ib(){return/^((?!chrome|android).)*safari/i.test(navigator.userAgent)}function ix(){var e,t;let r=ib()?window.visualViewport:null;return{x:null!=(e=null==r?void 0:r.offsetLeft)?e:0,y:null!=(t=null==r?void 0:r.offsetTop)?t:0}}function iy(e){return!!e&&!!ic(e)&&e instanceof iu(e).ShadowRoot}function ik(e){if(e&&ic(e)){let t=e.getRootNode();if(iy(t)||t instanceof Document)return t}return iv(e)}function iw(e){return e.matchMedia("(prefers-reduced-motion: reduce)").matches}function iS(e){return"value"in e}function iI(e){return"CANVAS"===e.tagName}var ij=new WeakMap,iz=class{constructor(){this.entries=new Set,this.clear=()=>{for(let e of this.entries){let[t,{type:r,listener:n,options:o}]=e;t.removeEventListener(r,n,o)}this.entries.clear()}}bind(e,t){let r=Array.isArray(e)?e:[e],n=Array.isArray(t)?t:[t],o=[];for(let e of r)for(let t of n){let{type:r,listener:n,options:i}=t,a=[e,t];e.addEventListener(r,n,i),this.entries.add(a),o.push(a)}let i=this.entries;return function(){for(let e of o){let[t,{type:r,listener:n,options:o}]=e;t.removeEventListener(r,n,o),i.delete(e)}}}};function iE(e){let t=null==e?void 0:e.ownerDocument.defaultView;if(t&&t.self!==t.parent)return t.frameElement}function iC(e,t){let r,n;return function(...o){let i=this;if(n){let a;null==r||r(),a=setTimeout(()=>{e.apply(i,o),n=performance.now()},t-(performance.now()-n)),r=()=>clearTimeout(a)}else e.apply(i,o),n=performance.now()}}var iA=i_?ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},iP=class extends iA{constructor(e){super(t=>{ie(this,e5)?e(t,this):ir(this,e5,!0)}),it(this,e5,!1)}};e5=new WeakMap;var iM=Array.from({length:100},(e,t)=>t/100),iO=class{constructor(e,t,r={debug:!1,skipInitial:!1}){this.element=e,this.callback=t,it(this,ti),this.disconnect=()=>{var e,t,r;ir(this,tn,!0),null==(e=ie(this,e7))||e.disconnect(),null==(t=ie(this,te))||t.disconnect(),ie(this,tt).disconnect(),null==(r=ie(this,tr))||r.remove()},it(this,e8,!0),it(this,e9),it(this,e7),it(this,te),it(this,tt),it(this,tr),it(this,tn,!1),it(this,to,iC(()=>{var e,t,r;let{element:n}=this;if(null==(e=ie(this,te))||e.disconnect(),ie(this,tn)||!ie(this,e8)||!n.isConnected)return;let o=null!=(t=n.ownerDocument)?t:document,{innerHeight:i,innerWidth:a}=null!=(r=o.defaultView)?r:window,l=n.getBoundingClientRect(),{top:s,left:c,bottom:u,right:d}=ig(n,l),p=-Math.floor(s),h=-Math.floor(c),f=-Math.floor(a-d),v=-Math.floor(i-u),g=`${p}px ${f}px ${v}px ${h}px`;this.boundingClientRect=l,ir(this,te,new IntersectionObserver(e=>{let[t]=e,{intersectionRect:r}=t;1!==(1!==t.intersectionRatio?t.intersectionRatio:n9.intersectionRatio(r,ig(n)))&&ie(this,to).call(this)},{threshold:iM,rootMargin:g,root:o})),ie(this,te).observe(n),io(this,ti,ta).call(this)},75)),this.boundingClientRect=e.getBoundingClientRect(),ir(this,e8,function(e,t=e.getBoundingClientRect()){let{width:r,height:n}=ig(e,t);return r>0&&n>0}(e,this.boundingClientRect));let n=!0;this.callback=e=>{n&&(n=!1,r.skipInitial)||t(e)};const o=e.ownerDocument;(null==r?void 0:r.debug)&&(ir(this,tr,document.createElement("div")),ie(this,tr).style.background="rgba(0,0,0,0.15)",ie(this,tr).style.position="fixed",ie(this,tr).style.pointerEvents="none",o.body.appendChild(ie(this,tr))),ir(this,tt,new IntersectionObserver(t=>{var r,n;let{boundingClientRect:o,isIntersecting:i}=t[t.length-1],{width:a,height:l}=o,s=ie(this,e8);ir(this,e8,i),(a||l)&&(s&&!i?(null==(r=ie(this,te))||r.disconnect(),this.callback(null),null==(n=ie(this,e7))||n.disconnect(),ir(this,e7,void 0),ie(this,tr)&&(ie(this,tr).style.visibility="hidden")):ie(this,to).call(this),i&&!ie(this,e7)&&(ir(this,e7,new iP(ie(this,to))),ie(this,e7).observe(e)))},{threshold:iM,root:o})),ie(this,e8)&&!r.skipInitial&&this.callback(this.boundingClientRect),ie(this,tt).observe(e)}};e8=new WeakMap,e9=new WeakMap,e7=new WeakMap,te=new WeakMap,tt=new WeakMap,tr=new WeakMap,tn=new WeakMap,to=new WeakMap,ti=new WeakSet,ta=function(){var e,t;!ie(this,tn)&&(io(this,ti,tl).call(this),(e=this.boundingClientRect)===(t=ie(this,e9))||e&&t&&e.top==t.top&&e.left==t.left&&e.right==t.right&&e.bottom==t.bottom||(this.callback(this.boundingClientRect),ir(this,e9,this.boundingClientRect)))},tl=function(){if(ie(this,tr)){let{top:e,left:t,width:r,height:n}=ig(this.element);ie(this,tr).style.overflow="hidden",ie(this,tr).style.visibility="visible",ie(this,tr).style.top=`${Math.floor(e)}px`,ie(this,tr).style.left=`${Math.floor(t)}px`,ie(this,tr).style.width=`${Math.floor(r)}px`,ie(this,tr).style.height=`${Math.floor(n)}px`}};var iD=new WeakMap,iT=new WeakMap,iN=class{constructor(e,t,r){this.callback=t,it(this,ts),it(this,tc,!1),it(this,tu),it(this,td,iC(e=>{if(!ie(this,tc)&&e.target&&"contains"in e.target&&"function"==typeof e.target.contains){for(let t of ie(this,tu))if(e.target.contains(t)){this.callback(ie(this,ts).boundingClientRect);break}}},75));const n=function(e){let t=new Set,r=iE(e);for(;r;)t.add(r),r=iE(r);return t}(e),o=function(e,t){let r=new Set;for(let n of e){let e=function(e,t){let r=iD.get(e);return r||(r={disconnect:new iO(e,t=>{let r=iD.get(e);r&&r.callbacks.forEach(e=>e(t))},{skipInitial:!0}).disconnect,callbacks:new Set}),r.callbacks.add(t),iD.set(e,r),()=>{r.callbacks.delete(t),0===r.callbacks.size&&(iD.delete(e),r.disconnect())}}(n,t);r.add(e)}return()=>r.forEach(e=>e())}(n,t),i=function(e,t){var r;let n=e.ownerDocument;if(!iT.has(n)){let e=new AbortController,t=new Set;document.addEventListener("scroll",e=>t.forEach(t=>t(e)),{capture:!0,passive:!0,signal:e.signal}),iT.set(n,{disconnect:()=>e.abort(),listeners:t})}let{listeners:o,disconnect:i}=null!=(r=iT.get(n))?r:{};return o&&i?(o.add(t),()=>{o.delete(t),0===o.size&&(i(),iT.delete(n))}):()=>{}}(e,ie(this,td));ir(this,tu,n),ir(this,ts,new iO(e,t,r)),this.disconnect=()=>{ie(this,tc)||(ir(this,tc,!0),o(),i(),ie(this,ts).disconnect())}}};function iL(e){return"showPopover"in e&&"hidePopover"in e&&"function"==typeof e.showPopover&&"function"==typeof e.hidePopover}function iB(e){try{iL(e)&&e.isConnected&&e.hasAttribute("popover")&&!e.matches(":popover-open")&&e.showPopover()}catch(e){}}function iR(e){return!!i_&&!!e&&e===iv(e).scrollingElement}function iF(e){var t,r;let n=iu(e),o=iR(e)?function(e){var t,r,n,o;let{documentElement:i}=iv(e),a=iu(e).visualViewport,l=null!=(t=null==a?void 0:a.width)?t:i.clientWidth,s=null!=(r=null==a?void 0:a.height)?r:i.clientHeight,c=null!=(n=null==a?void 0:a.offsetTop)?n:0,u=null!=(o=null==a?void 0:a.offsetLeft)?o:0;return{top:c,left:u,right:u+l,bottom:c+s,width:l,height:s}}(e):il(e),i=n.visualViewport,a=iR(e)?{height:null!=(t=null==i?void 0:i.height)?t:n.innerHeight,width:null!=(r=null==i?void 0:i.width)?r:n.innerWidth}:{height:e.clientHeight,width:e.clientWidth},l={current:{x:e.scrollLeft,y:e.scrollTop},max:{x:e.scrollWidth-a.width,y:e.scrollHeight-a.height}},s=l.current.y<=0,c=l.current.x<=0,u=l.current.y>=l.max.y,d=l.current.x>=l.max.x;return{rect:o,position:l,isTop:s,isLeft:c,isBottom:u,isRight:d}}ts=new WeakMap,tc=new WeakMap,tu=new WeakMap,td=new WeakMap;var iV=class{constructor(e){this.scheduler=e,this.pending=!1,this.tasks=new Set,this.resolvers=new Set,this.flush=()=>{let{tasks:e,resolvers:t}=this;for(let t of(this.pending=!1,this.tasks=new Set,this.resolvers=new Set,e))t();for(let e of t)e()}}schedule(e){return this.tasks.add(e),this.pending||(this.pending=!0,this.scheduler(this.flush)),new Promise(e=>this.resolvers.add(e))}},i$=new iV(e=>{"function"==typeof requestAnimationFrame?requestAnimationFrame(e):e()}),iW=new iV(e=>setTimeout(e,50)),iH=new Map,iq=iH.clear.bind(iH);function iU(e,t=!1){if(!t)return iZ(e);let r=iH.get(e);return r||(r=iZ(e),iH.set(e,r),iW.schedule(iq)),r}function iZ(e){return iu(e).getComputedStyle(e)}var iY={excludeElement:!0,escapeShadowDOM:!0};function iX(e,t=iY){let{limit:r,excludeElement:n,escapeShadowDOM:o}=t,i=new Set;return e?function t(a){if(null!=r&&i.size>=r||!a)return i;if(id(a)&&null!=a.scrollingElement&&!i.has(a.scrollingElement))return i.add(a.scrollingElement),i;if(o&&iy(a))return t(a.host);if(!ip(a))return ih(a)?t(a.parentElement):i;if(i.has(a))return i;let l=iU(a,!0);if(n&&a===e||function(e,t=iU(e,!0)){let r=/(auto|scroll|overlay)/;return["overflow","overflowX","overflowY"].some(e=>{let n=t[e];return"string"==typeof n&&r.test(n)})}(a,l)&&i.add(a),function(e,t=iU(e,!0)){return"fixed"===t.position||"sticky"===t.position}(a,l)){let{scrollingElement:e}=a.ownerDocument;return e&&i.add(e),i}return t(a.parentNode)}(e):i}function iK(e,t=window.frameElement){let r={x:0,y:0,scaleX:1,scaleY:1};if(!e)return r;let n=iE(e);for(;n&&n!==t;){let e=il(n),{x:t,y:o}=function(e,t=il(e)){let r=Math.round(t.width),n=Math.round(t.height);if(ip(e))return{x:r/e.offsetWidth,y:n/e.offsetHeight};let o=iU(e,!0);return{x:(parseFloat(o.width)||r)/r,y:(parseFloat(o.height)||n)/n}}(n,e);r.x=r.x+e.left,r.y=r.y+e.top,r.scaleX=r.scaleX*t,r.scaleY=r.scaleY*o,n=iE(n)}return r}function iJ(e){if("none"===e)return null;let[t,r,n="0"]=e.split(" "),o={x:parseFloat(t),y:parseFloat(r),z:parseInt(n,10)};return isNaN(o.x)&&isNaN(o.y)?null:{x:isNaN(o.x)?0:o.x,y:isNaN(o.y)?0:o.y,z:isNaN(o.z)?0:o.z}}function iG(e){var t,r,n,o,i,a,l,s,c;let{scale:u,transform:d,translate:p}=e,h=function(e){if("none"===e)return null;let t=e.split(" "),r=parseFloat(t[0]),n=parseFloat(t[1]);return isNaN(r)&&isNaN(n)?null:{x:isNaN(r)?n:r,y:isNaN(n)?r:n}}(u),f=iJ(p),v=function(e){if(e.startsWith("matrix3d(")){let t=e.slice(9,-1).split(/, /);return{x:+t[12],y:+t[13],scaleX:+t[0],scaleY:+t[5]}}if(e.startsWith("matrix(")){let t=e.slice(7,-1).split(/, /);return{x:+t[4],y:+t[5],scaleX:+t[0],scaleY:+t[3]}}return null}(d);if(!v&&!h&&!f)return null;let g={x:null!=(t=null==h?void 0:h.x)?t:1,y:null!=(r=null==h?void 0:h.y)?r:1},m={x:null!=(n=null==f?void 0:f.x)?n:0,y:null!=(o=null==f?void 0:f.y)?o:0},_={x:null!=(i=null==v?void 0:v.x)?i:0,y:null!=(a=null==v?void 0:v.y)?a:0,scaleX:null!=(l=null==v?void 0:v.scaleX)?l:1,scaleY:null!=(s=null==v?void 0:v.scaleY)?s:1};return{x:m.x+_.x,y:m.y+_.y,z:null!=(c=null==f?void 0:f.z)?c:0,scaleX:g.x*_.scaleX,scaleY:g.y*_.scaleY}}var iQ=((d=iQ||{})[d.Idle=0]="Idle",d[d.Forward=1]="Forward",d[d.Reverse=-1]="Reverse",d),i0={x:.2,y:.2},i1={x:10,y:10};function i2(e,{block:t="nearest",inline:r="nearest"}={}){if(!ip(e))return;let n=iX(e),o=[];for(let i of n){if(!ip(i))continue;let{top:n,left:a}=function(e,t){let r=i4(e),n=i4(t);return{top:r.top-n.top-t.clientTop,left:r.left-n.left-t.clientLeft}}(e,i),l=n,s=a;for(let e of o)l-=e.scrollTop,s-=e.scrollLeft;if("none"!==t){let r=l<i.scrollTop;r!==l+e.offsetHeight>i.scrollTop+i.clientHeight&&("center"===t?i.scrollTop=l-i.clientHeight/2+e.offsetHeight/2:r?i.scrollTop=l:i.scrollTop=l+e.offsetHeight-i.clientHeight)}if("none"!==r){let t=s<i.scrollLeft;t!==s+e.offsetWidth>i.scrollLeft+i.clientWidth&&("center"===r?i.scrollLeft=s-i.clientWidth/2+e.offsetWidth/2:t?i.scrollLeft=s:i.scrollLeft=s+e.offsetWidth-i.clientWidth)}o.push(i)}}function i4(e){let t=0,r=0,n=e;for(;n;){t+=n.offsetTop,r+=n.offsetLeft;let e=n.offsetParent;if(!ip(e))break;t+=e.clientTop,r+=e.clientLeft,n=e}return{top:t,left:r}}function i3({element:e,keyframes:t,options:r}){return e.animate(t,r).finished}function i6(e,t=iU(e).translate,r=!0){if(r){let t=ia(e,e=>"translate"in e);if(t){let{translate:e=""}=t[0];if("string"==typeof e){let t=iJ(e);if(t)return t}}}if(t){let e=iJ(t);if(e)return e}return{x:0,y:0,z:0}}var i5=new iV(e=>setTimeout(e,0)),i8=new Map,i9=i8.clear.bind(i8),i7=class extends n9{constructor(e,t={}){var r,n,o,i;let a;const{frameTransform:l=iK(e),ignoreTransforms:s,getBoundingClientRect:c=il}=t,u=function(e,t){let r=(function(e){let t=e.ownerDocument,r=i8.get(t);if(r)return r;r=t.getAnimations(),i8.set(t,r),i5.schedule(i9);let n=r.filter(t=>ii(t.effect)&&t.effect.target===e);return i8.set(e,n),r})(e).filter(e=>{var r,n;if(ii(e.effect)){let{target:o}=e.effect;if(null==(n=o&&(null==(r=t.isValidTarget)?void 0:r.call(t,o)))||n)return e.effect.getKeyframes().some(e=>{for(let r of t.properties)if(e[r])return!0})}}).map(e=>{let{effect:t,currentTime:r}=e,n=null==t?void 0:t.getComputedTiming().duration;if(!e.pending&&"finished"!==e.playState&&"number"==typeof n&&"number"==typeof r&&r<n)return e.currentTime=n,()=>{e.currentTime=r}});if(r.length>0)return()=>r.forEach(e=>null==e?void 0:e())}(e,{properties:["transform","translate","scale","width","height"],isValidTarget:t=>(t!==e||ib())&&t.contains(e)}),d=c(e);let{top:p,left:h,width:f,height:v}=d;const g=iU(e),m=iG(g),_={x:null!=(r=null==m?void 0:m.scaleX)?r:1,y:null!=(n=null==m?void 0:m.scaleY)?n:1},b=function(e,t){let r,n,o,i=e.getAnimations();if(!i.length)return null;let a=!1;for(let e of i){if("running"!==e.playState)continue;let t=ii(e.effect)?e.effect.getKeyframes():[],i=t[t.length-1];if(!i)continue;let{transform:l,translate:s,scale:c}=i;"string"==typeof l&&l&&(r=l,a=!0),"string"==typeof s&&s&&(n=s,a=!0),"string"==typeof c&&c&&(o=c,a=!0)}return a?iG({transform:null!=r?r:t.transform,translate:null!=n?n:t.translate,scale:null!=o?o:t.scale}):null}(e,g);null==u||u(),m&&(a=function(e,t,r){let{scaleX:n,scaleY:o,x:i,y:a}=t,l=e.left-i-(1-n)*parseFloat(r),s=e.top-a-(1-o)*parseFloat(r.slice(r.indexOf(" ")+1)),c=n?e.width/n:e.width,u=o?e.height/o:e.height;return{width:c,height:u,top:s,right:l+c,bottom:s+u,left:l}}(d,m,g.transformOrigin),(s||b)&&(p=a.top,h=a.left,f=a.width,v=a.height));const y={width:null!=(o=null==a?void 0:a.width)?o:f,height:null!=(i=null==a?void 0:a.height)?i:v};if(b&&!s&&a){const e=function(e,t,r){let{scaleX:n,scaleY:o,x:i,y:a}=t,l=e.left+i+(1-n)*parseFloat(r),s=e.top+a+(1-o)*parseFloat(r.slice(r.indexOf(" ")+1)),c=n?e.width*n:e.width,u=o?e.height*o:e.height;return{width:c,height:u,top:s,right:l+c,bottom:s+u,left:l}}(a,b,g.transformOrigin);p=e.top,h=e.left,f=e.width,v=e.height,_.x=b.scaleX,_.y=b.scaleY}l&&(s||(h*=l.scaleX,f*=l.scaleX,p*=l.scaleY,v*=l.scaleY),h+=l.x,p+=l.y),super(h,p,f,v),this.scale=_,this.intrinsicWidth=y.width,this.intrinsicHeight=y.height}};function ae(e){return"style"in e&&"object"==typeof e.style&&null!==e.style&&"setProperty"in e.style&&"removeProperty"in e.style&&"function"==typeof e.style.setProperty&&"function"==typeof e.style.removeProperty}var at=class{constructor(e){this.element=e,this.initial=new Map}set(e,t=""){let{element:r}=this;if(ae(r))for(let[n,o]of Object.entries(e)){let e=`${t}${n}`;this.initial.has(e)||this.initial.set(e,r.style.getPropertyValue(e)),r.style.setProperty(e,"string"==typeof o?o:`${o}px`)}}remove(e,t=""){let{element:r}=this;if(ae(r))for(let n of e){let e=`${t}${n}`;r.style.removeProperty(e)}}reset(){let{element:e}=this;if(ae(e)){for(let[t,r]of this.initial)e.style.setProperty(t,r);""===e.getAttribute("style")&&e.removeAttribute("style")}}};function ar(e){return!!e&&(e instanceof iu(e).Element||ic(e)&&e.nodeType===Node.ELEMENT_NODE)}function an(e){if(!e)return!1;let{KeyboardEvent:t}=iu(e.target);return e instanceof t}var ao={};function ai(e){let t=null==ao[e]?0:ao[e]+1;return ao[e]=t,`${e}-${t}`}var aa=e=>{var t;return null!=(t=(({dragOperation:e,droppable:t})=>{let r=e.position.current;if(!r)return null;let{id:n}=t;return t.shape&&t.shape.containsPoint(r)?{id:n,value:1/n8.distance(t.shape.center,r),type:oK.PointerIntersection,priority:oX.High}:null})(e))?t:(({dragOperation:e,droppable:t})=>{let{shape:r}=e;if(!t.shape||!(null==r?void 0:r.current))return null;let n=r.current.intersectionArea(t.shape);if(n){let{position:o}=e,i=n8.distance(t.shape.center,o.current),a=n/(r.current.area+t.shape.area-n);return{id:t.id,value:a/i,type:oK.ShapeIntersection,priority:oX.Normal}}return null})(e)},al=e=>{let{dragOperation:t,droppable:r}=e,{shape:n,position:o}=t;if(!r.shape)return null;let i=n?n9.from(n.current.boundingRectangle).corners:void 0,a=n9.from(r.shape.boundingRectangle).corners.reduce((e,t,r)=>{var n;return e+n8.distance(n8.from(t),null!=(n=null==i?void 0:i[r])?n:o.current)},0);return{id:r.id,value:1/(a/4),type:oK.Collision,priority:oX.Normal}},as=Object.create,ac=Object.defineProperty,au=Object.defineProperties,ad=Object.getOwnPropertyDescriptor,ap=Object.getOwnPropertyDescriptors,ah=Object.getOwnPropertySymbols,af=Object.prototype.hasOwnProperty,av=Object.prototype.propertyIsEnumerable,ag=(e,t)=>(t=Symbol[e])?t:Symbol.for("Symbol."+e),am=e=>{throw TypeError(e)},a_=(e,t,r)=>t in e?ac(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,ab=(e,t)=>{for(var r in t||(t={}))af.call(t,r)&&a_(e,r,t[r]);if(ah)for(var r of ah(t))av.call(t,r)&&a_(e,r,t[r]);return e},ax=(e,t)=>ac(e,"name",{value:t,configurable:!0}),ay=(e,t)=>{var r={};for(var n in e)af.call(e,n)&&0>t.indexOf(n)&&(r[n]=e[n]);if(null!=e&&ah)for(var n of ah(e))0>t.indexOf(n)&&av.call(e,n)&&(r[n]=e[n]);return r},ak=e=>{var t;return[,,,as(null!=(t=null==e?void 0:e[ag("metadata")])?t:null)]},aw=["class","method","getter","setter","accessor","field","value","get","set"],aS=e=>void 0!==e&&"function"!=typeof e?am("Function expected"):e,aI=(e,t,r,n,o)=>({kind:aw[e],name:t,metadata:n,addInitializer:e=>r._?am("Already initialized"):o.push(aS(e||null))}),aj=(e,t)=>a_(t,ag("metadata"),e[3]),az=(e,t,r,n)=>{for(var o=0,i=e[t>>1],a=i&&i.length;o<a;o++)1&t?i[o].call(r):n=i[o].call(r,n);return n},aE=(e,t,r,n,o,i)=>{var a,l,s,c,u,d=7&t,p=!!(8&t),h=!!(16&t),f=d>3?e.length+1:d?p?1:2:0,v=aw[d+5],g=d>3&&(e[f-1]=[]),m=e[f]||(e[f]=[]),_=d&&(h||p||(o=o.prototype),d<5&&(d>3||!h)&&ad(d<4?o:{get[r](){return aP(this,i)},set[r](x){return aO(this,i,x)}},r));d?h&&d<4&&ax(i,(d>2?"set ":d>1?"get ":"")+r):ax(o,r);for(var b=n.length-1;b>=0;b--)c=aI(d,r,s={},e[3],m),d&&(c.static=p,c.private=h,u=c.access={has:h?e=>aA(o,e):e=>r in e},3^d&&(u.get=h?e=>(1^d?aP:aD)(e,o,4^d?i:_.get):e=>e[r]),d>2&&(u.set=h?(e,t)=>aO(e,o,t,4^d?i:_.set):(e,t)=>e[r]=t)),l=(0,n[b])(d?d<4?h?i:_[v]:d>4?void 0:{get:_.get,set:_.set}:o,c),s._=1,4^d||void 0===l?aS(l)&&(d>4?g.unshift(l):d?h?i=l:_[v]=l:o=l):"object"!=typeof l||null===l?am("Object expected"):(aS(a=l.get)&&(_.get=a),aS(a=l.set)&&(_.set=a),aS(a=l.init)&&g.unshift(a));return d||aj(e,o),_&&ac(o,r,_),h?4^d?i:_:o},aC=(e,t,r)=>t.has(e)||am("Cannot "+r),aA=(e,t)=>Object(t)!==t?am('Cannot use the "in" operator on this value'):e.has(t),aP=(e,t,r)=>(aC(e,t,"read from private field"),r?r.call(e):t.get(e)),aM=(e,t,r)=>t.has(e)?am("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,r),aO=(e,t,r,n)=>(aC(e,t,"write to private field"),n?n.call(e,r):t.set(e,r),r),aD=(e,t,r)=>(aC(e,t,"access private method"),r),aT={draggable:"To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item in a given direction. Press space again to drop the item in its new position, or press escape to cancel."},aN={dragstart({operation:{source:e}}){if(e)return`Picked up draggable item ${e.id}.`},dragover({operation:{source:e,target:t}}){if(e&&e.id!==(null==t?void 0:t.id))return t?`Draggable item ${e.id} was moved over droppable target ${t.id}.`:`Draggable item ${e.id} is no longer over a droppable target.`},dragend({operation:{source:e,target:t},canceled:r}){if(e)return r?`Dragging was cancelled. Draggable item ${e.id} was dropped.`:t?`Draggable item ${e.id} was dropped over droppable target ${t.id}`:`Draggable item ${e.id} was dropped.`}},aL=["dragover","dragmove"],aB=class extends oD{constructor(e,t){let r,n,o,i;super(e);const{id:a,idPrefix:{description:l="dnd-kit-description",announcement:s="dnd-kit-announcement"}={},announcements:c=aN,screenReaderInstructions:u=aT,debounce:d=500}=null!=t?t:{},p=a?`${l}-${a}`:ai(l),h=a?`${s}-${a}`:ai(s),f=(e=i)=>{o&&e&&(null==o?void 0:o.nodeValue)!==e&&(o.nodeValue=e)},v=()=>i$.schedule(f),g=function(e,t){let r,n=()=>{clearTimeout(r),r=setTimeout(e,t)};return n.cancel=()=>clearTimeout(r),n}(v,d),m=Object.entries(c).map(([e,t])=>this.manager.monitor.addEventListener(e,(r,n)=>{let a=o;if(!a)return;let l=null==t?void 0:t(r,n);l&&a.nodeValue!==l&&(i=l,aL.includes(e)?g():(v(),g.cancel()))})),_=()=>{var e;let t=[];if(!(null==r?void 0:r.isConnected)){let n;e=u.draggable,(n=document.createElement("div")).id=p,n.style.setProperty("display","none"),n.textContent=e,r=n,t.push(r)}if(!(null==n?void 0:n.isConnected)){let e;(e=document.createElement("div")).id=h,e.setAttribute("role","status"),e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.style.setProperty("position","fixed"),e.style.setProperty("width","1px"),e.style.setProperty("height","1px"),e.style.setProperty("margin","-1px"),e.style.setProperty("border","0"),e.style.setProperty("padding","0"),e.style.setProperty("overflow","hidden"),e.style.setProperty("clip","rect(0 0 0 0)"),e.style.setProperty("clip-path","inset(100%)"),e.style.setProperty("white-space","nowrap"),n=e,o=document.createTextNode(""),n.appendChild(o),t.push(n)}t.length>0&&document.body.append(...t)},b=new Set;function y(){for(let e of b)e()}this.registerEffect(()=>{var e;for(let t of(b.clear(),this.manager.registry.draggables.value)){let o=null!=(e=t.handle)?e:t.element;if(o){for(let e of(r&&n||b.add(_),(!["input","select","textarea","a","button"].includes(o.tagName.toLowerCase())||ib())&&!o.hasAttribute("tabindex")&&b.add(()=>o.setAttribute("tabindex","0")),o.hasAttribute("role")||"button"===o.tagName.toLowerCase()||b.add(()=>o.setAttribute("role","button")),o.hasAttribute("aria-roledescription")||b.add(()=>o.setAttribute("aria-roledescription","draggable")),o.hasAttribute("aria-describedby")||b.add(()=>o.setAttribute("aria-describedby",p)),["aria-pressed","aria-grabbed"])){let r=String(t.isDragging);o.getAttribute(e)!==r&&b.add(()=>o.setAttribute(e,r))}let e=String(t.disabled);o.getAttribute("aria-disabled")!==e&&b.add(()=>o.setAttribute("aria-disabled",e))}}b.size>0&&i$.schedule(y)}),this.destroy=()=>{super.destroy(),null==r||r.remove(),null==n||n.remove(),m.forEach(e=>e())}}},aR=new Map,aF=class extends(tg=oT,tv=[nO],tf=[nD],th=[nD],tp=[nD],tg){constructor(e,t){super(e,t),az(t_,5,this),aM(this,tx),aM(this,tm,new Set),aM(this,tb,az(t_,8,this,new Set)),az(t_,11,this),this.registerEffect(aD(this,tx,ty))}register(e){return aP(this,tm).add(e),()=>{aP(this,tm).delete(e)}}addRoot(e){return rG(()=>{let t=new Set(this.additionalRoots);t.add(e),this.additionalRoots=t}),()=>{rG(()=>{let t=new Set(this.additionalRoots);t.delete(e),this.additionalRoots=t})}}get sourceRoot(){var e;let{source:t}=this.manager.dragOperation;return ik(null!=(e=null==t?void 0:t.element)?e:null)}get targetRoot(){var e;let{target:t}=this.manager.dragOperation;return ik(null!=(e=null==t?void 0:t.element)?e:null)}get roots(){let{status:e}=this.manager.dragOperation;return e.initializing||e.initialized?new Set([...[this.sourceRoot,this.targetRoot].filter(e=>null!=e),...this.additionalRoots]):new Set}};t_=ak(tg),tm=new WeakMap,tb=new WeakMap,tx=new WeakSet,ty=function(){let{roots:e}=this,t=[];for(let r of e)for(let e of aP(this,tm))t.push(aD(this,tx,tk).call(this,r,e));return()=>{for(let e of t)e()}},tk=function(e,t){let r=aR.get(e);r||(r=new Map,aR.set(e,r));let n=r.get(t);if(!n){let o=id(e)?aD(this,tx,tw).call(this,e,r,t):aD(this,tx,tS).call(this,e,r,t);if(!o)return()=>{};n=o,r.set(t,n)}n.refCount++;let o=!1;return()=>{o||(o=!0,n.refCount--,0===n.refCount&&n.cleanup())}},tw=function(e,t,r){var n;let o=e.createElement("style"),{nonce:i}=null!=(n=this.options)?n:{};i&&o.setAttribute("nonce",i),o.textContent=r,e.head.prepend(o);let a=new MutationObserver(t=>{for(let r of t)for(let t of Array.from(r.removedNodes))if(t===o)return void e.head.prepend(o)});return a.observe(e.head,{childList:!0}),{refCount:0,cleanup:()=>{a.disconnect(),o.remove(),t.delete(r),0===t.size&&aR.delete(e)}}},tS=function(e,t,r){"adoptedStyleSheets"in e&&Array.isArray(e.adoptedStyleSheets);let n=e.ownerDocument.defaultView,{CSSStyleSheet:o}=null!=n?n:{};if(!o)return null;let i=new o;return i.replaceSync(r),e.adoptedStyleSheets.push(i),{refCount:0,cleanup:()=>{var n;if(iy(e)&&(null==(n=e.host)?void 0:n.isConnected)){let t=e.adoptedStyleSheets.indexOf(i);-1!==t&&e.adoptedStyleSheets.splice(t,1)}t.delete(r),0===t.size&&aR.delete(e)}}},aE(t_,4,"additionalRoots",tv,aF,tb),aE(t_,2,"sourceRoot",tf,aF),aE(t_,2,"targetRoot",th,aF),aE(t_,2,"roots",tp,aF),aj(t_,aF),aF.configure=oM(aF);var aV=class extends oD{constructor(e,t){super(e,t),this.manager=e;const{cursor:r="grabbing"}=null!=t?t:{},n=e.registry.plugins.get(aF),o=null==n?void 0:n.register(`* { cursor: ${r} !important; }`);if(o){const e=this.destroy.bind(this);this.destroy=()=>{o(),e()}}}},a$="data-dnd-",aW=`${a$}dropping`,aH="--dnd-",aq=`${a$}dragging`,aU=`${a$}placeholder`,aZ=[aq,aU,"popover","aria-pressed","aria-grabbing"],aY=["view-transition-name"],aX=`
  :is(:root,:host) [${aq}] {
    position: fixed !important;
    pointer-events: none !important;
    touch-action: none;
    z-index: calc(infinity);
    will-change: translate;
    top: var(${aH}top, 0px) !important;
    left: var(${aH}left, 0px) !important;
    right: unset !important;
    bottom: unset !important;
    width: var(${aH}width, auto);
    max-width: var(${aH}width, auto);
    height: var(${aH}height, auto);
    max-height: var(${aH}height, auto);
    transform: var(${aH}transform, none) !important;
    transition: var(${aH}transition) !important;
  }

  :is(:root,:host) [${aU}] {
    transition: none;
  }

  :is(:root,:host) [${aU}='hidden'] {
    visibility: hidden;
  }

  [${aq}] * {
    pointer-events: none !important;
  }

  [${aq}]:not([${aW}]) {
    translate: var(${aH}translate) !important;
  }

  [${aq}][style*='${aH}scale'] {
    scale: var(${aH}scale) !important;
    transform-origin: var(${aH}transform-origin) !important;
  }

  @layer dnd-kit {
    :where([${aq}][popover]) {
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
  [${aq}]::backdrop, [${a$}overlay]:not([${aq}]) {
    display: none;
    visibility: hidden;
  }
`.replace(/\n+/g," ").replace(/\s+/g," ").trim();function aK(e,t){return e===t||iE(e)===iE(t)}function aJ(e){let{target:t}=e;"newState"in e&&"closed"===e.newState&&ar(t)&&t.hasAttribute("popover")&&requestAnimationFrame(()=>iB(t))}function aG(e){return"TR"===e.tagName}var aQ=class extends(tj=oD,tI=[nO],tj){constructor(e,t){super(e,t),aM(this,tC),aM(this,tE,az(tz,8,this)),az(tz,11,this),this.state={initial:{},current:{}};const r=e.registry.plugins.get(aF),n=null==r?void 0:r.register(aX);if(n){const e=this.destroy.bind(this);this.destroy=()=>{n(),e()}}this.registerEffect(aD(this,tC,tA).bind(this,r)),this.registerEffect(aD(this,tC,tP))}};tz=ak(tj),tE=new WeakMap,tC=new WeakSet,tA=function(e){let{overlay:t}=this;if(!t||!e)return;let r=ik(t);if(r)return e.addRoot(r)},tP=function(){var e,t,r,n,o,i,a,l;let s,c,u,{state:d,manager:p,options:h}=this,{dragOperation:f}=p,{position:v,source:g,status:m}=f;if(m.idle){d.current={},d.initial={};return}if(!g)return;let{element:_}=g,b=g.pluginConfig(aQ),y=null!=(t=null!=(e=null==b?void 0:b.feedback)?e:null==h?void 0:h.feedback)?t:"default",k="function"==typeof y?y(g,p):y;if(!_||"none"===k||!m.initialized||m.initializing)return;let{initial:w}=d,S=null!=(r=this.overlay)?r:_,I=iK(S),j=iK(_),z=!aK(_,S),E=new i7(_,{frameTransform:z?j:null,ignoreTransforms:!z}),C={x:j.scaleX/I.scaleX,y:j.scaleY/I.scaleY},{width:A,height:P,top:M,left:O}=E;z&&(A/=C.x,P/=C.y);let D=new at(S),T=iU(_),{transition:N,translate:L,boxSizing:B,paddingBlockStart:R,paddingBlockEnd:F,paddingInlineStart:V,paddingInlineEnd:$,borderInlineStartWidth:W,borderInlineEndWidth:H,borderBlockStartWidth:q,borderBlockEndWidth:U}=T,Z=N.split(",").filter(e=>!/^\s*(transform|translate|scale)\b/.test(e)).join(","),Y=iG(T),X=T.transform,K="clone"===k,J="content-box"===B,G=J?parseInt(V)+parseInt($)+parseInt(W)+parseInt(H):0,Q=J?parseInt(R)+parseInt(F)+parseInt(q)+parseInt(U):0,ee="move"===k||this.overlay?null:function(e,t="hidden"){return rG(()=>{let r,n,o,{element:i,manager:a}=e;if(!i||!a)return;let l=function(e,t){let r=new Map;for(let n of t)if(n.element&&(e===n.element||e.contains(n.element))){let e=`${a$}${ai("dom-id")}`;n.element.setAttribute(e,""),r.set(n,e)}return r}(i,a.registry.droppables),s=[],c=(r="input, textarea, select, canvas, [contenteditable]",n=i.cloneNode(!0),o=Array.from(i.querySelectorAll(r)),Array.from(n.querySelectorAll(r)).forEach((e,t)=>{let r=o[t];if(iS(e)&&iS(r)&&("file"!==e.type&&(e.value=r.value),"radio"===e.type&&e.name&&(e.name=`Cloned__${e.name}`)),iI(e)&&iI(r)&&r.width>0&&r.height>0){let t=e.getContext("2d");null==t||t.drawImage(r,0,0)}}),n),{remove:u}=c;return function(e,t,r){for(let[n,o]of e){if(!n.element)continue;let e=`[${o}]`,i=t.matches(e)?t:t.querySelector(e);if(n.element.removeAttribute(o),!i)continue;let a=n.element;n.proxy=i,i.removeAttribute(o),ij.set(a,i),r.push(()=>{ij.delete(a),n.proxy=void 0})}}(l,c,s),function(e,t="hidden"){e.setAttribute("inert","true"),e.setAttribute("tab-index","-1"),e.setAttribute("aria-hidden","true"),e.setAttribute(aU,t)}(c,t),c.remove=()=>{s.forEach(e=>e()),u.call(c)},c})}(g,K?"clone":"hidden"),et=rG(()=>an(p.dragOperation.activatorEvent));if(!w.translate){if(this.overlay&&Y)w.translate={x:Y.x,y:Y.y};else if("none"!==L){let e=iJ(L);e&&(w.translate=e)}}if(!w.transformOrigin){let e=rG(()=>v.current),t=O+(null!=(n=null==Y?void 0:Y.x)?n:0),r=M+(null!=(o=null==Y?void 0:Y.y)?o:0);w.transformOrigin={x:(e.x-t*I.scaleX-I.x)/(A*I.scaleX),y:(e.y-r*I.scaleY-I.y)/(P*I.scaleY)}}let{transformOrigin:er}=w,en=M*I.scaleY+I.y,eo=O*I.scaleX+I.x;if(!w.coordinates&&(w.coordinates={x:eo,y:en},1!==C.x||1!==C.y)){let{scaleX:e,scaleY:t}=j,{x:r,y:n}=er;w.coordinates.x+=(A*e-A)*r,w.coordinates.y+=(P*t-P)*n}w.dimensions||(w.dimensions={width:A,height:P}),w.frameTransform||(w.frameTransform=I);let ei={x:w.coordinates.x-eo,y:w.coordinates.y-en},ea={width:(w.dimensions.width*w.frameTransform.scaleX-A*I.scaleX)*er.x,height:(w.dimensions.height*w.frameTransform.scaleY-P*I.scaleY)*er.y},el={x:ei.x/I.scaleX+ea.width,y:ei.y/I.scaleY+ea.height},es={left:O+el.x,top:M+el.y};S.setAttribute(aq,"true");let ec=rG(()=>f.transform),eu=null!=(i=w.translate)?i:{x:0,y:0},ed=ec.x*I.scaleX+eu.x,ep=ec.y*I.scaleY+eu.y,eh=ix();D.set({width:A-G,height:P-Q,top:es.top+eh.y,left:es.left+eh.x,translate:`${ed}px ${ep}px 0`,transform:this.overlay?"none":X,transition:Z?`${Z}, translate 0ms linear`:"translate 0ms linear",scale:z?`${C.x} ${C.y}`:"","transform-origin":`${100*er.x}% ${100*er.y}%`},aH),ee&&(_.insertAdjacentElement("afterend",ee),(null==h?void 0:h.rootElement)&&("function"==typeof h.rootElement?h.rootElement(g):h.rootElement).appendChild(_)),iL(S)&&(S.hasAttribute("popover")||S.setAttribute("popover","manual"),iB(S),S.addEventListener("beforetoggle",aJ));let ef=(l={placeholder:ee,element:_,feedbackElement:S,frameTransform:I,transformOrigin:er,width:A,height:P,top:M,left:O,widthOffset:G,heightOffset:Q,delta:el,styles:D,dragOperation:f,getTranslate:()=>d.current.translate,getElementMutationObserver:()=>s,getSavedCellWidths:()=>u,setSavedCellWidths:e=>{u=e}},new ResizeObserver(()=>{var e,t,r;let n=new i7(l.placeholder,{frameTransform:l.frameTransform,ignoreTransforms:!0}),o=null!=(e=l.transformOrigin)?e:{x:1,y:1},i=(l.width-n.width)*o.x+l.delta.x,a=(l.height-n.height)*o.y+l.delta.y,s=ix();if(l.styles.set({width:n.width-l.widthOffset,height:n.height-l.heightOffset,top:l.top+a+s.y,left:l.left+i+s.x},aH),null==(t=l.getElementMutationObserver())||t.takeRecords(),aG(l.element)&&aG(l.placeholder)){let e=Array.from(l.element.cells),t=Array.from(l.placeholder.cells);for(let[r,n]of(l.getSavedCellWidths()||l.setSavedCellWidths(e.map(e=>e.style.width)),e.entries())){let e=t[r];n.style.width=`${e.getBoundingClientRect().width}px`}}let c=null!=(r=l.getTranslate())?r:{x:0,y:0},u=l.left+i+s.x+c.x,d=l.top+a+s.y+c.y,p=n.width-l.widthOffset,h=n.height-l.heightOffset,f=l.frameTransform;l.dragOperation.shape=new n9(u*f.scaleX+f.x,d*f.scaleY+f.y,p*f.scaleX,h*f.scaleY)})),ev=new i7(S);rG(()=>f.shape=ev);let eg=iu(S),em=e=>{this.manager.actions.stop({event:e})},e_=iw(eg);if(et&&eg.addEventListener("resize",em),"idle"===rG(()=>g.status)&&requestAnimationFrame(()=>g.status="dragging"),ee){let e,t;ef.observe(ee),(e=new MutationObserver(e=>{let t=!1;for(let r of e){if(r.target!==_){t=!0;continue}if("attributes"!==r.type)continue;let e=r.attributeName;if(e.startsWith("aria-")||aZ.includes(e))continue;let n=_.getAttribute(e);if("style"===e){if(ae(_)&&ae(ee)){let e=_.style;for(let t of Array.from(ee.style))""===e.getPropertyValue(t)&&ee.style.removeProperty(t);for(let t of Array.from(e)){if(aY.includes(t)||t.startsWith(aH))continue;let r=e.getPropertyValue(t);ee.style.setProperty(t,r)}}}else null!==n?ee.setAttribute(e,n):ee.removeAttribute(e)}t&&K&&ee.replaceChildren(..._.cloneNode(!0).childNodes)})).observe(_,{attributes:!0,subtree:!0,childList:!0}),s=e,(t=new MutationObserver(e=>{for(let t of e)if(0!==t.addedNodes.length)for(let e of Array.from(t.addedNodes)){if(e.contains(_)&&_.nextElementSibling!==ee){_.insertAdjacentElement("afterend",ee),iB(S);return}if(e.contains(ee)&&ee.previousElementSibling!==_){ee.insertAdjacentElement("beforebegin",_),iB(S);return}}_.isConnected&&ee.isConnected&&_.nextElementSibling!==ee&&(_.insertAdjacentElement("afterend",ee),iB(S))})).observe(_.ownerDocument.body,{childList:!0,subtree:!0}),c=t}let eb=null==(a=p.dragOperation.source)?void 0:a.id,ex=()=>{var e;if(!et||null==eb)return;let t=p.registry.draggables.get(eb),r=null!=(e=null==t?void 0:t.handle)?e:null==t?void 0:t.element;ip(r)&&r.focus()},ey=()=>{var e;if(null==s||s.disconnect(),null==c||c.disconnect(),ef.disconnect(),eg.removeEventListener("resize",em),iL(S)&&(S.removeEventListener("beforetoggle",aJ),S.removeAttribute("popover")),S.removeAttribute(aq),D.reset(),u&&aG(_))for(let[t,r]of Array.from(_.cells).entries())r.style.width=null!=(e=u[t])?e:"";g.status="idle";let t=null!=d.current.translate,r=f.status.dragging;ee&&(!r&&t||ee.parentElement!==S.parentElement)&&S.isConnected&&ee.replaceWith(S),null==ee||ee.remove()},ek=null==h?void 0:h.dropAnimation,ew=this,eS=nN(()=>{var e,t,r;let{transform:n,status:o}=f;if((n.x||n.y||d.current.translate)&&o.dragging){let o=null!=(e=w.translate)?e:{x:0,y:0},i={x:n.x/I.scaleX+o.x,y:n.y/I.scaleY+o.y},a=d.current.translate,l=rG(()=>f.modifiers),c=rG(()=>{var e;return null==(e=f.shape)?void 0:e.current}),u=null==h?void 0:h.keyboardTransition,p=et&&!e_&&null!==u?`${null!=(t=null==u?void 0:u.duration)?t:250}ms ${null!=(r=null==u?void 0:u.easing)?r:"cubic-bezier(0.25, 1, 0.5, 1)"}`:"0ms linear";if(D.set({transition:Z?`${Z}, translate ${p}`:`translate ${p}`,translate:`${i.x}px ${i.y}px 0`},aH),null==s||s.takeRecords(),c&&c!==ev&&a&&!l.length){let e=n8.delta(i,a);f.shape=n9.from(c.boundingRectangle).translate(e.x*I.scaleX,e.y*I.scaleY)}else f.shape=new i7(S);d.current.translate=i}},function(){if(f.status.dropped){this.dispose(),g.status="dropping";let e=(null==b?void 0:b.dropAnimation)!==void 0?b.dropAnimation:void 0!==ew.dropAnimation?ew.dropAnimation:ek,t=d.current.translate,r=null!=t;if(t||_===S||(t={x:0,y:0}),!t||null===e)return void ey();p.renderer.rendering.then(()=>{!function(e){var t,r,n,o;let{animation:i}=e;if("function"==typeof i)return Promise.resolve(i({source:e.source,element:e.element,feedbackElement:e.feedbackElement,placeholder:e.placeholder,translate:e.translate,moved:e.moved})).then(()=>{e.cleanup(),requestAnimationFrame(e.restoreFocus)});let{duration:a=250,easing:l="ease"}=null!=i?i:{};iB(e.feedbackElement);let[,s]=null!=(t=ia(e.feedbackElement,e=>"translate"in e))?t:[];null==s||s.pause();let c=null!=(r=e.placeholder)?r:e.element,u={frameTransform:aK(e.feedbackElement,c)?null:void 0},d=new i7(e.feedbackElement,u),p=null!=(n=iJ(iU(e.feedbackElement).translate))?n:e.translate,h=new i7(c,u),f=n9.delta(d,h,e.alignment),v={x:p.x-f.x,y:p.y-f.y},g=Math.round(d.intrinsicHeight)!==Math.round(h.intrinsicHeight)?{minHeight:[`${d.intrinsicHeight}px`,`${h.intrinsicHeight}px`],maxHeight:[`${d.intrinsicHeight}px`,`${h.intrinsicHeight}px`]}:{},m=Math.round(d.intrinsicWidth)!==Math.round(h.intrinsicWidth)?{minWidth:[`${d.intrinsicWidth}px`,`${h.intrinsicWidth}px`],maxWidth:[`${d.intrinsicWidth}px`,`${h.intrinsicWidth}px`]}:{};e.styles.set({transition:e.transition},aH),e.feedbackElement.setAttribute(aW,""),null==(o=e.getElementMutationObserver())||o.takeRecords(),i3({element:e.feedbackElement,keyframes:au(ab(ab({},g),m),ap({translate:[`${p.x}px ${p.y}px 0`,`${v.x}px ${v.y}px 0`]})),options:{duration:iw(iu(e.feedbackElement))?0:e.moved||e.feedbackElement!==e.element?a:0,easing:l}}).then(()=>{e.feedbackElement.removeAttribute(aW),null==s||s.finish(),e.cleanup(),requestAnimationFrame(e.restoreFocus)})}({source:g,element:_,feedbackElement:S,placeholder:ee,translate:t,moved:r,transition:N,alignment:g.alignment,styles:D,animation:null!=e?e:void 0,getElementMutationObserver:()=>s,cleanup:ey,restoreFocus:ex})})}});return()=>{ey(),eS()}},aE(tz,4,"overlay",tI,aQ,tE),aj(tz,aQ),aQ.configure=oM(aQ),tD=[nO],tT=iQ.Forward,tM=[nO],tO=iQ.Reverse;var a0=class{constructor(){aM(this,tL,az(tN,8,this,!0)),az(tN,11,this),aM(this,tB,az(tN,12,this,!0)),az(tN,15,this)}isLocked(e){return e!==iQ.Idle&&(null==e?!0===this[iQ.Forward]&&!0===this[iQ.Reverse]:!0===this[e])}unlock(e){e!==iQ.Idle&&(this[e]=!1)}};tN=ak(null),tL=new WeakMap,tB=new WeakMap,aE(tN,4,tT,tD,a0,tL),aE(tN,4,tO,tM,a0,tB),aj(tN,a0);var a1=[iQ.Forward,iQ.Reverse],a2=class{constructor(){this.x=new a0,this.y=new a0}isLocked(){return this.x.isLocked()&&this.y.isLocked()}},a4=class extends oD{constructor(e){super(e);const t=r9(new a2);let r=null;this.signal=t,nl(()=>{let{status:n}=e.dragOperation;if(!n.initialized){r=null,t.value=new a2;return}let{delta:o}=e.dragOperation.position;if(r){let e={x:a3(o.x,r.x),y:a3(o.y,r.y)},n=t.peek();rX(()=>{for(let t of or)for(let r of a1)e[t]===r&&n[t].unlock(r);t.value=n})}r=o})}get current(){return this.signal.peek()}};function a3(e,t){return Math.sign(e-t)}var a6=class extends(tF=oT,tR=[nO],tF){constructor(e){super(e),aM(this,t$,az(tV,8,this,!1)),az(tV,11,this),aM(this,tW),aM(this,tH,()=>{if(!aP(this,tW))return;let{element:e,by:t}=aP(this,tW);t.y&&(e.scrollTop+=t.y),t.x&&(e.scrollLeft+=t.x)}),this.scroll=(e,t)=>{var r;if(this.disabled)return!1;let n=this.getScrollableElements();if(!n)return aO(this,tW,void 0),!1;let{position:o}=this.manager.dragOperation,i=null==o?void 0:o.current;if(i){let{by:o}=null!=e?e:{},a=o?{x:a5(o.x),y:a5(o.y)}:void 0,l=a?void 0:this.scrollIntentTracker.current;if(null==l?void 0:l.isLocked())return!1;for(let e of n){let n=function(e,t){let{isTop:r,isBottom:n,isLeft:o,isRight:i,position:a}=iF(e),{x:l,y:s}=null!=t?t:{x:0,y:0},c=!r&&a.current.y+s>0,u=!n&&a.current.y+s<a.max.y,d=!o&&a.current.x+l>0,p=!i&&a.current.x+l<a.max.x;return{top:c,bottom:u,left:d,right:p,x:d||p,y:c||u}}(e,o);if(n.x||n.y){let{speed:n,direction:s}=function(e,t,r,n=25,o=i0,i=i1){let{x:a,y:l}=t,{rect:s,isTop:c,isBottom:u,isLeft:d,isRight:p}=iF(e),h=iK(e),f=iG(iU(e,!0)),v=null!==f&&(null==f?void 0:f.scaleX)<0,g=null!==f&&(null==f?void 0:f.scaleY)<0,m=new n9(s.left*h.scaleX+h.x,s.top*h.scaleY+h.y,s.width*h.scaleX,s.height*h.scaleY),_={x:0,y:0},b={x:0,y:0},y={height:m.height*o.y,width:m.width*o.x};return y.height>0&&(!c||g&&!u)&&l<=m.top+y.height&&(null==r?void 0:r.y)!==1&&a>=m.left-i.x&&a<=m.right+i.x?(_.y=g?1:-1,b.y=n*Math.abs((m.top+y.height-l)/y.height)):y.height>0&&(!u||g&&!c)&&l>=m.bottom-y.height&&(null==r?void 0:r.y)!==-1&&a>=m.left-i.x&&a<=m.right+i.x&&(_.y=g?-1:1,b.y=n*Math.abs((m.bottom-y.height-l)/y.height)),y.width>0&&(!p||v&&!d)&&a>=m.right-y.width&&(null==r?void 0:r.x)!==-1&&l>=m.top-i.y&&l<=m.bottom+i.y?(_.x=v?-1:1,b.x=n*Math.abs((m.right-y.width-a)/y.width)):y.width>0&&(!d||v&&!p)&&a<=m.left+y.width&&(null==r?void 0:r.x)!==1&&l>=m.top-i.y&&l<=m.bottom+i.y&&(_.x=v?1:-1,b.x=n*Math.abs((m.left+y.width-a)/y.width)),{direction:_,speed:b}}(e,i,a,null==t?void 0:t.acceleration,null==t?void 0:t.threshold);if(l)for(let e of or)l[e].isLocked(s[e])&&(n[e]=0,s[e]=0);if(s.x||s.y){let{x:t,y:i}=null!=o?o:s,a=t*n.x,l=i*n.y;if(a||l){let t=null==(r=aP(this,tW))?void 0:r.by;if(this.autoScrolling&&t&&(t.x&&!a||t.y&&!l))continue;return aO(this,tW,{element:e,by:{x:a,y:l}}),i$.schedule(aP(this,tH)),!0}}}}}return aO(this,tW,void 0),!1};let t=null,r=null;const n=nP(()=>{let{position:r,source:n}=e.dragOperation;if(!r)return null;let o=function e(t,{x:r,y:n}){var o;let i=t.elementFromPoint(r,n);if((null==(o=i)?void 0:o.tagName)==="IFRAME"){let{contentDocument:t}=i;if(t){let{left:o,top:a}=i.getBoundingClientRect();return e(t,{x:r-o,y:n-a})}}return i}(ik(null==n?void 0:n.element),r.current);return o&&(t=o),null!=o?o:t}),o=nP(()=>{let t=n.value,{documentElement:o}=iv(t);if(!t||t===o){let{target:t}=e.dragOperation,n=null==t?void 0:t.element;if(n){let e=iX(n,{excludeElement:!1});return r=e,e}}if(t){let e=iX(t,{excludeElement:!1});return this.autoScrolling&&r&&e.size<(null==r?void 0:r.size)?r:(r=e,e)}return r=null,null},nM);this.getScrollableElements=()=>o.value,this.scrollIntentTracker=new a4(e),this.destroy=e.monitor.addEventListener("dragmove",t=>{!this.disabled&&!t.defaultPrevented&&an(e.dragOperation.activatorEvent)&&t.by&&this.scroll({by:t.by})&&t.preventDefault()})}};function a5(e){return e>0?iQ.Forward:e<0?iQ.Reverse:iQ.Idle}tV=ak(tF),t$=new WeakMap,tW=new WeakMap,tH=new WeakMap,aE(tV,4,"autoScrolling",tR,a6,t$),aj(tV,a6);var a8=new class{constructor(e){this.scheduler=e,this.pending=!1,this.tasks=new Set,this.resolvers=new Set,this.flush=()=>{let{tasks:e,resolvers:t}=this;for(let t of(this.pending=!1,this.tasks=new Set,this.resolvers=new Set,e))t();for(let e of t)e()}}schedule(e){return this.tasks.add(e),this.pending||(this.pending=!0,this.scheduler(this.flush)),new Promise(e=>this.resolvers.add(e))}}(e=>{"function"==typeof requestAnimationFrame?requestAnimationFrame(e):e()}),a9=class extends oD{constructor(e,t){super(e,t);const r=e.registry.plugins.get(a6);if(!r)throw Error("AutoScroller plugin depends on Scroller plugin");this.destroy=nl(()=>{var t,n,o;if(this.disabled)return;let{position:i,status:a}=e.dragOperation;if(a.dragging){let e={acceleration:null==(t=this.options)?void 0:t.acceleration,threshold:"number"==typeof(null==(n=this.options)?void 0:n.threshold)?{x:this.options.threshold,y:this.options.threshold}:null==(o=this.options)?void 0:o.threshold};if(r.scroll(void 0,e)){r.autoScrolling=!0;let t=setInterval(()=>a8.schedule(()=>r.scroll(void 0,e)),10);return()=>{clearInterval(t)}}r.autoScrolling=!1}})}};a9.configure=oM(a9);var a7={capture:!0,passive:!0},le=class extends oT{constructor(e){super(e),aM(this,tq),this.handleScroll=()=>{null==aP(this,tq)&&aO(this,tq,setTimeout(()=>{this.manager.collisionObserver.forceUpdate(!1),aO(this,tq,void 0)},50))};const{dragOperation:t}=this.manager;this.destroy=nl(()=>{var e,r,n;if(t.status.dragging){let o=null!=(n=null==(r=null==(e=t.source)?void 0:e.element)?void 0:r.ownerDocument)?n:document;return o.addEventListener("scroll",this.handleScroll,a7),()=>{o.removeEventListener("scroll",this.handleScroll,a7)}}})}};tq=new WeakMap;var lt=class extends oD{constructor(e){super(e),this.manager=e;const t=e.registry.plugins.get(aF),r=null==t?void 0:t.register("* { user-select: none !important; -webkit-user-select: none !important; }");if(this.destroy=nl(()=>{let{dragOperation:e}=this.manager;if(e.status.initialized)return lr(),document.addEventListener("selectionchange",lr,{capture:!0}),()=>{document.removeEventListener("selectionchange",lr,{capture:!0})}}),r){const e=this.destroy.bind(this);this.destroy=()=>{r(),e()}}}};function lr(){var e;null==(e=document.getSelection())||e.removeAllRanges()}var ln=Object.freeze({offset:10,keyboardCodes:{start:["Space","Enter"],cancel:["Escape"],end:["Space","Enter","Tab"],up:["ArrowUp"],down:["ArrowDown"],left:["ArrowLeft"],right:["ArrowRight"]},preventActivation(e,t){var r;let n=null!=(r=t.handle)?r:t.element;return e.target!==n}}),lo=class extends oQ{constructor(e,t){super(e),this.manager=e,this.options=t,aM(this,tU,[]),this.listeners=new iz,this.handleSourceKeyDown=(e,t,r)=>{if(this.disabled||e.defaultPrevented||!ar(e.target)||t.disabled)return;let{keyboardCodes:n=ln.keyboardCodes,preventActivation:o=ln.preventActivation}=null!=r?r:{};!n.start.includes(e.code)||!this.manager.dragOperation.status.idle||null!=o&&o(e,t)||this.handleStart(e,t,r)}}bind(e,t=this.options){return nl(()=>{var r;let n=null!=(r=e.handle)?r:e.element,o=r=>{an(r)&&this.handleSourceKeyDown(r,e,t)};if(n)return n.addEventListener("keydown",o),()=>{n.removeEventListener("keydown",o)}})}handleStart(e,t,r){let{element:n}=t;if(!n)throw Error("Source draggable does not have an associated element");e.preventDefault(),e.stopImmediatePropagation(),i2(n);let{center:o}=new i7(n);if(this.manager.actions.start({event:e,coordinates:{x:o.x,y:o.y},source:t}).signal.aborted)return this.cleanup();this.sideEffects();let i=iv(n),a=[this.listeners.bind(i,[{type:"keydown",listener:e=>this.handleKeyDown(e,t,r),options:{capture:!0}}])];aP(this,tU).push(...a)}handleKeyDown(e,t,r){let{keyboardCodes:n=ln.keyboardCodes}=null!=r?r:{};if(li(e,[...n.end,...n.cancel])){e.preventDefault();let t=li(e,n.cancel);this.handleEnd(e,t);return}li(e,n.up)?this.handleMove("up",e):li(e,n.down)&&this.handleMove("down",e),li(e,n.left)?this.handleMove("left",e):li(e,n.right)&&this.handleMove("right",e)}handleEnd(e,t){this.manager.actions.stop({event:e,canceled:t}),this.cleanup()}handleMove(e,t){var r,n;let{shape:o}=this.manager.dragOperation,i=t.shiftKey?5:1,a={x:0,y:0},l=null!=(n=null==(r=this.options)?void 0:r.offset)?n:ln.offset;if("number"==typeof l&&(l={x:l,y:l}),o){switch(e){case"up":a={x:0,y:-l.y*i};break;case"down":a={x:0,y:l.y*i};break;case"left":a={x:-l.x*i,y:0};break;case"right":a={x:l.x*i,y:0}}(a.x||a.y)&&(t.preventDefault(),this.manager.actions.move({event:t,by:a}))}}sideEffects(){let e=this.manager.registry.plugins.get(a9);(null==e?void 0:e.disabled)===!1&&(e.disable(),aP(this,tU).push(()=>{e.enable()}))}cleanup(){aP(this,tU).forEach(e=>e()),aO(this,tU,[])}destroy(){this.cleanup(),this.listeners.clear()}};function li(e,t){return t.includes(e.code)}tU=new WeakMap,lo.configure=oM(lo),lo.defaults=ln;var la=class extends o1{constructor(){super(...arguments),aM(this,tZ)}onEvent(e){switch(e.type){case"pointerdown":aO(this,tZ,im(e));break;case"pointermove":if(!aP(this,tZ))return;let{x:t,y:r}=im(e),n={x:t-aP(this,tZ).x,y:r-aP(this,tZ).y},{tolerance:o}=this.options;if(o&&oe(n,o))return void this.abort();oe(n,this.options.value)&&this.activate(e);break;case"pointerup":this.abort()}}abort(){aO(this,tZ,void 0)}};tZ=new WeakMap;var ll=class extends o1{constructor(){super(...arguments),aM(this,tY),aM(this,tX)}onEvent(e){switch(e.type){case"pointerdown":aO(this,tX,im(e)),aO(this,tY,setTimeout(()=>this.activate(e),this.options.value));break;case"pointermove":if(!aP(this,tX))return;let{x:t,y:r}=im(e);oe({x:t-aP(this,tX).x,y:r-aP(this,tX).y},this.options.tolerance)&&this.abort();break;case"pointerup":this.abort()}}abort(){aP(this,tY)&&(clearTimeout(aP(this,tY)),aO(this,tX,void 0),aO(this,tY,void 0))}};tY=new WeakMap,tX=new WeakMap;var ls=class{};ls.Delay=ll,ls.Distance=la;var lc=Object.freeze({activationConstraints(e,t){var r;let{pointerType:n,target:o}=e;if(!("mouse"===n&&ar(o)&&(t.handle===o||(null==(r=t.handle)?void 0:r.contains(o)))))return"touch"===n?[new ls.Delay({value:250,tolerance:5})]:function(e){var t;if(!ar(e))return!1;let{tagName:r}=e;return"INPUT"===r||"TEXTAREA"===r||(t=e).hasAttribute("contenteditable")&&"false"!==t.getAttribute("contenteditable")}(o)&&!e.defaultPrevented?[new ls.Delay({value:200,tolerance:0})]:[new ls.Delay({value:200,tolerance:10}),new ls.Distance({value:5})]},preventActivation(e,t){var r;let{target:n}=e;return!(n===t.element||n===t.handle||!ar(n)||(null==(r=t.handle)?void 0:r.contains(n)))&&!!n.closest(`
      input:not([disabled]),
      select:not([disabled]),
      textarea:not([disabled]),
      button:not([disabled]),
      a[href],
      [contenteditable]:not([contenteditable="false"])
    `)}}),lu=class extends oQ{constructor(e,t){super(e),this.manager=e,this.options=t,aM(this,tK,new Set),this.listeners=new iz,this.latest={event:void 0,coordinates:void 0},this.handleMove=()=>{let{event:e,coordinates:t}=this.latest;e&&t&&this.manager.actions.move({event:e,to:t})},this.handleCancel=this.handleCancel.bind(this),this.handlePointerUp=this.handlePointerUp.bind(this),this.handleKeyDown=this.handleKeyDown.bind(this)}activationConstraints(e,t,r=this.options){let{activationConstraints:n=lc.activationConstraints}=null!=r?r:{};return"function"==typeof n?n(e,t):n}bind(e,t=this.options){return nl(()=>{var r,n;let o=new AbortController,{signal:i}=o,a=r=>{(function(e){if(!e)return!1;let{PointerEvent:t}=iu(e.target);return e instanceof t})(r)&&this.handlePointerDown(r,e,t)},l=[null!=(r=e.handle)?r:e.element];for(let r of((null==t?void 0:t.activatorElements)&&(l=Array.isArray(t.activatorElements)?t.activatorElements:t.activatorElements(e)),l)){r&&(!(n=r.ownerDocument.defaultView)||lh.has(n)||(n.addEventListener("touchmove",lp,{capture:!1,passive:!1}),lh.add(n)),r.addEventListener("pointerdown",a,{signal:i}))}return()=>o.abort()})}handlePointerDown(e,t,r){if(this.disabled||!e.isPrimary||0!==e.button||!ar(e.target)||t.disabled||"sensor"in e||!this.manager.dragOperation.status.idle)return;let{preventActivation:n=lc.preventActivation}=null!=r?r:{};if(null==n?void 0:n(e,t))return;let{target:o}=e,i=ip(o)&&o.draggable&&"true"===o.getAttribute("draggable"),a=iK(t.element),{x:l,y:s}=im(e);this.initialCoordinates={x:l*a.scaleX+a.x,y:s*a.scaleY+a.y};let c=this.activationConstraints(e,t,r);e.sensor=this;let u=new o0(c,e=>this.handleStart(t,e));u.signal.onabort=()=>this.handleCancel(e),u.onEvent(e),this.controller=u;let d=function e(t=document,r=new Set){if(r.has(t))return[];r.add(t);let n=[t];for(let o of Array.from(t.querySelectorAll("iframe, frame")))try{let t=o.contentDocument;t&&!r.has(t)&&n.push(...e(t,r))}catch(e){}try{let o=t.defaultView;if(o&&o!==window.top){let i=o.parent;i&&i.document&&i.document!==t&&n.push(...e(i.document,r))}}catch(e){}return n}(),p=this.listeners.bind(d,[{type:"pointermove",listener:e=>this.handlePointerMove(e,t)},{type:"pointerup",listener:this.handlePointerUp,options:{capture:!0}},{type:"pointercancel",listener:this.handleCancel},{type:"dragstart",listener:i?this.handleCancel:ld,options:{capture:!0}}]),h=()=>{p(),this.initialCoordinates=void 0};aP(this,tK).add(h)}handlePointerMove(e,t){var r,n;if((null==(r=this.controller)?void 0:r.activated)===!1){null==(n=this.controller)||n.onEvent(e);return}if(this.manager.dragOperation.status.dragging){let r=im(e),n=iK(t.element);r.x=r.x*n.scaleX+n.x,r.y=r.y*n.scaleY+n.y,e.preventDefault(),e.stopPropagation(),this.latest.event=e,this.latest.coordinates=r,i$.schedule(this.handleMove)}}handlePointerUp(e){let{status:t}=this.manager.dragOperation;if(!t.idle){e.preventDefault(),e.stopPropagation();let r=!t.initialized;this.manager.actions.stop({event:e,canceled:r})}this.cleanup()}handleKeyDown(e){"Escape"===e.key&&(e.preventDefault(),this.handleCancel(e))}handleStart(e,t){let{manager:r,initialCoordinates:n}=this;if(!n||!r.dragOperation.status.idle||t.defaultPrevented)return;if(r.actions.start({coordinates:n,event:t,source:e}).signal.aborted)return this.cleanup();t.preventDefault();let o=iv(t.target).body;try{o.setPointerCapture(t.pointerId)}catch(e){this.handleCancel(t);return}let i=ar(t.target)?[t.target,o]:o,a=this.listeners.bind(i,[{type:"touchmove",listener:ld,options:{passive:!1}},{type:"click",listener:ld},{type:"contextmenu",listener:ld},{type:"keydown",listener:this.handleKeyDown}]);aP(this,tK).add(a)}handleCancel(e){let{dragOperation:t}=this.manager;t.status.initialized&&this.manager.actions.stop({event:e,canceled:!0}),this.cleanup()}cleanup(){let{controller:e}=this;this.controller=void 0,e&&!e.signal.aborted&&e.abort(),this.latest={event:void 0,coordinates:void 0},aP(this,tK).forEach(e=>e()),aP(this,tK).clear()}destroy(){this.cleanup(),this.listeners.clear()}};function ld(e){e.preventDefault()}function lp(){}tK=new WeakMap,lu.configure=oM(lu),lu.defaults=lc;var lh=new WeakSet,lf=[],lv=[aB,a9,aV,aQ,lt],lg=[lu,lo],lm=class extends o8{constructor(e={}){const t=o5(e.plugins,lv),r=o5(e.sensors,lg),n=o5(e.modifiers,lf);super(((e,t)=>au(e,ap(t)))(ab({},e),{plugins:[le,a6,aF,...t],sensors:r,modifiers:n}))}},l_=class extends(tQ=oW,tG=[nO],tJ=[nO],tQ){constructor(e,t){var{element:r,effects:n=()=>[],handle:o}=e;super(ab({effects:()=>[...n(),()=>{var e,t;let{manager:r}=this;if(!r)return;let n=(null!=(t=null==(e=this.sensors)?void 0:e.map(oO))?t:[...r.sensors]).map(e=>{let t=e instanceof oQ?e:r.registry.register(e.plugin),n=e instanceof oQ?void 0:e.options;return t.bind(this,n)});return function(){n.forEach(e=>e())}}]},ay(e,["element","effects","handle"])),t),aM(this,t1,az(t0,8,this)),az(t0,11,this),aM(this,t2,az(t0,12,this)),az(t0,15,this),this.element=r,this.handle=o}};t0=ak(tQ),t1=new WeakMap,t2=new WeakMap,aE(t0,4,"handle",tG,l_,t1),aE(t0,4,"element",tJ,l_,t2),aj(t0,l_);var lb=class extends(t6=oH,t3=[nO],t4=[nO],t6){constructor(e,t){var{element:r,effects:n=()=>[]}=e,o=ay(e,["element","effects"]);const{collisionDetector:i=aa}=o,a=e=>{let{manager:t,element:r}=this;if(!r||null===e){this.shape=void 0;return}if(!t)return;let n=new i7(r),o=rG(()=>this.shape);return n&&(null==o?void 0:o.equals(n))?o:(this.shape=n,n)},l=r9(!1);super(((e,t)=>au(e,ap(t)))(ab({},o),{collisionDetector:i,effects:()=>[...n(),()=>{let{element:e,manager:t}=this;if(!t)return;let{dragOperation:r}=t,{source:n}=r;l.value=!!(n&&r.status.initialized&&e&&!this.disabled&&this.accepts(n))},()=>{let{element:e}=this;if(l.value&&e){let t=new iN(e,a);return()=>{t.disconnect(),this.shape=void 0}}},()=>{var e;if(null==(e=this.manager)?void 0:e.dragOperation.status.initialized)return()=>{this.shape=void 0}}]}),t),aM(this,rt),aM(this,t8,az(t5,8,this)),az(t5,11,this),aM(this,rr,az(t5,12,this)),az(t5,15,this),this.element=r,this.refreshShape=()=>a()}set element(e){aO(this,rt,e,re)}get element(){var e;return null!=(e=this.proxy)?e:aP(this,rt,t7)}};t5=ak(t6),t8=new WeakMap,rt=new WeakSet,rr=new WeakMap,t7=(t9=aE(t5,20,"#element",t3,rt,t8)).get,re=t9.set,aE(t5,4,"proxy",t4,lb,rr),aj(t5,lb);var lx=e.i(174080);function ly(e){var t;if(null!=e)return null!=e&&"object"==typeof e&&"current"in e?null!=(t=e.current)?t:void 0:e}var lk="u">typeof window&&void 0!==window.document&&void 0!==window.document.createElement?r_.useLayoutEffect:r_.useEffect;function lw(e,t){let r,n=(0,r_.useRef)(new Map),o=(r=(0,r_.useState)(0)[1],(0,r_.useCallback)(()=>{r(e=>e+1)},[r]));return lk(()=>e?nl(()=>{var r;let i=!1,a=!1;for(let o of n.current){let[l]=o,s=rG(()=>o[1]),c=e[l];s!==c&&(i=!0,n.current.set(l,c),a=null!=(r=null==t?void 0:t(l,s,c))&&r)}i&&(a?queueMicrotask(()=>(0,lx.flushSync)(o)):o())}):void n.current.clear(),[e]),(0,r_.useMemo)(()=>e?new Proxy(e,{get(e,t){let r=e[t];return n.current.set(t,r),r}}):e,[e])}function lS(e,t){e()}function lI(e){let t=(0,r_.useRef)(e);return lk(()=>{t.current=e},[e]),t}function lj(e,t,r=r_.useEffect,n=Object.is){let o=(0,r_.useRef)(e);r(()=>{let r=o.current;n(e,r)||(o.current=e,t(e,r))},[t,e])}function lz(e,t){let r=(0,r_.useRef)(ly(e));lk(()=>{let n=ly(e);n!==r.current&&(r.current=n,t(n))})}var lE=Object.defineProperty,lC=Object.defineProperties,lA=Object.getOwnPropertyDescriptors,lP=Object.getOwnPropertySymbols,lM=Object.prototype.hasOwnProperty,lO=Object.prototype.propertyIsEnumerable,lD=(e,t,r)=>t in e?lE(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,lT=(e,t)=>{for(var r in t||(t={}))lM.call(t,r)&&lD(e,r,t[r]);if(lP)for(var r of lP(t))lO.call(t,r)&&lD(e,r,t[r]);return e},lN=new lm,lL=(0,r_.createContext)(lN),lB=(0,r_.memo)((0,r_.forwardRef)(({children:e},t)=>{let[r,n]=(0,r_.useState)(0),o=(0,r_.useRef)(null),i=(0,r_.useRef)(null),a=(0,r_.useMemo)(()=>({renderer:{get rendering(){var e;return null!=(e=o.current)?e:Promise.resolve()}},trackRendering(e){o.current||(o.current=new Promise(e=>{i.current=e})),(0,r_.startTransition)(()=>{e(),n(e=>e+1)})}}),[]);return lk(()=>{var e;null==(e=i.current)||e.call(i),o.current=null},[e,r]),(0,r_.useImperativeHandle)(t,()=>a),null})),lR=[void 0,nM];function lF(e){let t;var r,{children:n,onCollision:o,onBeforeDragStart:i,onDragStart:a,onDragMove:l,onDragOver:s,onDragEnd:c}=e,u=((e,t)=>{var r={};for(var n in e)lM.call(e,n)&&0>t.indexOf(n)&&(r[n]=e[n]);if(null!=e&&lP)for(var n of lP(e))0>t.indexOf(n)&&lO.call(e,n)&&(r[n]=e[n]);return r})(e,["children","onCollision","onBeforeDragStart","onDragStart","onDragMove","onDragOver","onDragEnd"]);let d=(0,r_.useRef)(null),{plugins:p,modifiers:h,sensors:f}=u,v=o5(p,lv),g=o5(f,lg),m=o5(h,lf),_=lI(i),b=lI(a),y=lI(s),k=lI(l),w=lI(c),S=lI(o),I=(r=()=>{var e;return null!=(e=u.manager)?e:new lm(u)},(t=(0,r_.useRef)(null)).current||(t.current=r()),(0,r_.useInsertionEffect)(()=>()=>{var e;return null==(e=t.current)?void 0:e.destroy()},[]),t.current);return(0,r_.useEffect)(()=>{if(!d.current)throw Error("Renderer not found");let{renderer:e,trackRendering:t}=d.current,{monitor:r}=I;I.renderer=e;let n=[r.addEventListener("beforedragstart",e=>{let r=_.current;r&&t(()=>r(e,I))}),r.addEventListener("dragstart",e=>{var t;return null==(t=b.current)?void 0:t.call(b,e,I)}),r.addEventListener("dragover",e=>{let r=y.current;r&&t(()=>r(e,I))}),r.addEventListener("dragmove",e=>{let r=k.current;r&&t(()=>r(e,I))}),r.addEventListener("dragend",e=>{let r=w.current;r&&t(()=>r(e,I))}),r.addEventListener("collision",e=>{var t;return null==(t=S.current)?void 0:t.call(S,e,I)})];return()=>n.forEach(e=>e())},[I]),lj(v,()=>I&&(I.plugins=v),...lR),lj(g,()=>I&&(I.sensors=g),...lR),lj(m,()=>I&&(I.modifiers=m),...lR),(0,rg.jsxs)(lL.Provider,{value:I,children:[(0,rg.jsx)(lB,{ref:d,children:n}),n]})}function lV(){return(0,r_.useContext)(lL)}function l$(e){var t;let r=null!=(t=lV())?t:void 0,[n]=(0,r_.useState)(()=>e(r));return n.manager!==r&&(n.manager=r),lk(n.register,[r,n]),n}function lW(e,t,r){return"isDragSource"===e&&!r&&!!t}var lH=Object.create,lq=Object.defineProperty,lU=Object.getOwnPropertyDescriptor,lZ=(e,t)=>(t=Symbol[e])?t:Symbol.for("Symbol."+e),lY=e=>{throw TypeError(e)},lX=["class","method","getter","setter","accessor","field","value","get","set"],lK=e=>void 0!==e&&"function"!=typeof e?lY("Function expected"):e,lJ=(e,t,r,n,o)=>({kind:lX[e],name:t,metadata:n,addInitializer:e=>r._?lY("Already initialized"):o.push(lK(e||null))}),lG=(e,t,r,n,o,i)=>{for(var a,l,s,c=7&t,u=lX[c+5],d=e[2]||(e[2]=[]),p=lU(o=o.prototype,r),h=n.length-1;h>=0;h--)(s=lJ(c,r,l={},e[3],d)).static=!1,s.private=!1,(s.access={has:e=>r in e}).get=e=>e[r],a=(0,n[h])(p[u],s),l._=1,lK(a)&&(p[u]=a);return p&&lq(o,r,p),o},lQ=(e,t,r)=>t.has(e)||lY("Cannot "+r),l0=class e{constructor(e,t){this.x=e,this.y=t}static delta(t,r){return new e(t.x-r.x,t.y-r.y)}static distance(e,t){return Math.hypot(e.x-t.x,e.y-t.y)}static equals(e,t){return e.x===t.x&&e.y===t.y}static from({x:t,y:r}){return new e(t,r)}},l1=class extends(ri=nL,ro=[nD],rn=[nD],ri){constructor(e){super(l0.from(e),(e,t)=>l0.equals(e,t)),((e,t)=>{for(var r=0,n=e[2],o=n&&n.length;r<o;r++)n[r].call(t)})(rl,this),((e,t)=>t.has(e)?lY("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,0))(this,ra),this.velocity={x:0,y:0}}get delta(){return l0.delta(this.current,this.initial)}get direction(){let{current:e,previous:t}=this;if(!t)return null;let r={x:e.x-t.x,y:e.y-t.y};return r.x||r.y?Math.abs(r.x)>Math.abs(r.y)?r.x>0?"right":"left":r.y>0?"down":"up":null}get current(){return super.current}set current(e){let t,{current:r}=this,n=l0.from(e),o={x:n.x-r.x,y:n.y-r.y},i=Date.now(),a=i-(lQ(this,t=ra,"read from private field"),t.get(this)),l=e=>Math.round(e/a*100);rX(()=>{let e;lQ(this,e=ra,"write to private field"),e.set(this,i),this.velocity={x:l(o.x),y:l(o.y)},super.current=n})}reset(e=this.defaultValue){super.reset(l0.from(e)),this.velocity={x:0,y:0}}};rl=[,,,lH(null!=(p=null==ri?void 0:ri[lZ("metadata")])?p:null)],ra=new WeakMap,lG(rl,2,"delta",ro,l1),lG(rl,2,"direction",rn,l1),h=rl,r=lZ("metadata"),n=h[3],r in l1?lq(l1,r,{enumerable:!0,configurable:!0,writable:!0,value:n}):l1[r]=n;var l2=((f=l2||{}).Horizontal="x",f.Vertical="y",f);Object.values(l2);var l4=e=>{var t;return null!=(t=(({dragOperation:e,droppable:t})=>{let r=e.position.current;if(!r)return null;let{id:n}=t;return t.shape&&t.shape.containsPoint(r)?{id:n,value:1/l0.distance(t.shape.center,r),type:oK.PointerIntersection,priority:oX.High}:null})(e))?t:(({dragOperation:e,droppable:t})=>{let{shape:r}=e;if(!t.shape||!(null==r?void 0:r.current))return null;let n=r.current.intersectionArea(t.shape);if(n){let{position:o}=e,i=l0.distance(t.shape.center,o.current),a=n/(r.current.area+t.shape.area-n);return{id:t.id,value:a/i,type:oK.ShapeIntersection,priority:oX.Normal}}return null})(e)};function l3(e){let{collisionDetector:t,data:r,disabled:n,element:o,id:i,accept:a,type:l}=e,s=l$(t=>new lb(lC(lT({},e),lA({register:!1,element:ly(o)})),t)),c=lw(s);return lj(i,()=>s.id=i),lz(o,e=>s.element=e),lj(a,()=>s.accept=a,void 0,nM),lj(t,()=>s.collisionDetector=null!=t?t:l4),lj(r,()=>r&&(s.data=r)),lj(n,()=>s.disabled=!0===n),lj(l,()=>s.type=l),{droppable:c,get isDropTarget(){return c.isDropTarget},ref:(0,r_.useCallback)(e=>{var t,r;(e||null==(t=s.element)||!t.isConnected||(null==(r=s.manager)?void 0:r.dragOperation.status.idle))&&(s.element=null!=e?e:void 0)},[s])}}var l6=Object.create,l5=Object.defineProperty,l8=Object.defineProperties,l9=Object.getOwnPropertyDescriptor,l7=Object.getOwnPropertyDescriptors,se=Object.getOwnPropertySymbols,st=Object.prototype.hasOwnProperty,sr=Object.prototype.propertyIsEnumerable,sn=e=>{throw TypeError(e)},so=(e,t,r)=>t in e?l5(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,si=(e,t)=>{for(var r in t||(t={}))st.call(t,r)&&so(e,r,t[r]);if(se)for(var r of se(t))sr.call(t,r)&&so(e,r,t[r]);return e},sa=["class","method","getter","setter","accessor","field","value","get","set"],sl=e=>void 0!==e&&"function"!=typeof e?sn("Function expected"):e,ss=(e,t,r,n,o)=>({kind:sa[e],name:t,metadata:n,addInitializer:e=>r._?sn("Already initialized"):o.push(sl(e||null))}),sc=(e,t,r,n)=>{for(var o=0,i=e[t>>1],a=i&&i.length;o<a;o++)1&t?i[o].call(r):n=i[o].call(r,n);return n},su=(e,t,r,n,o,i)=>{for(var a,l,s,c,u,d=7&t,p=e.length+1,h=sa[d+5],f=e[p-1]=[],v=e[p]||(e[p]=[]),g=(o=o.prototype,l9({get[r](){return sp(this,i)},set[r](x){return sf(this,i,x)}},r)),m=n.length-1;m>=0;m--)(c=ss(d,r,s={},e[3],v)).static=!1,c.private=!1,(u=c.access={has:e=>r in e}).get=e=>e[r],u.set=(e,t)=>e[r]=t,l=(0,n[m])({get:g.get,set:g.set},c),s._=1,void 0===l?sl(l)&&(g[h]=l):"object"!=typeof l||null===l?sn("Object expected"):(sl(a=l.get)&&(g.get=a),sl(a=l.set)&&(g.set=a),sl(a=l.init)&&f.unshift(a));return g&&l5(o,r,g),o},sd=(e,t,r)=>t.has(e)||sn("Cannot "+r),sp=(e,t,r)=>(sd(e,t,"read from private field"),t.get(e)),sh=(e,t,r)=>t.has(e)?sn("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,r),sf=(e,t,r,n)=>(sd(e,t,"write to private field"),t.set(e,r),r);function sv(e){return e instanceof sN||e instanceof sT}var sg=class extends oD{constructor(e){super(e);const t=nl(()=>{let{dragOperation:t}=e;if(an(t.activatorEvent)&&sv(t.source)&&t.status.initialized){let t=e.registry.plugins.get(a6);if(t)return t.disable(),()=>t.enable()}}),r=e.monitor.addEventListener("dragmove",(e,t)=>{queueMicrotask(()=>{if(this.disabled||e.defaultPrevented||!e.nativeEvent)return;let{dragOperation:r}=t;if(!an(e.nativeEvent)||!sv(r.source)||!r.shape)return;let{actions:n,collisionObserver:o,registry:i}=t,{by:a}=e;if(!a)return;let l=function(e){let{x:t,y:r}=e;return t>0?"right":t<0?"left":r>0?"down":r<0?"up":void 0}(a),{source:s,target:c}=r,{center:u}=r.shape.current,d=[],p=[];rX(()=>{for(let e of i.droppables){let{id:t}=e;if(!e.accepts(s)||t===(null==c?void 0:c.id)&&sv(e)||!e.element)continue;let r=e.shape,n=new i7(e.element,{getBoundingClientRect:e=>ig(e,void 0,.2)});n.height&&n.width&&("down"==l&&u.y+10<n.center.y||"up"==l&&u.y-10>n.center.y||"left"==l&&u.x-10>n.center.x||"right"==l&&u.x+10<n.center.x)&&(d.push(e),e.shape=n,p.push(()=>e.shape=r))}}),e.preventDefault(),o.disable();let h=o.computeCollisions(d,al);rX(()=>p.forEach(e=>e()));let[f]=h;if(!f)return;let{id:v}=f,{index:g,group:m}=s.sortable;n.setDropTarget(v).then(()=>{let{source:e,target:t,shape:i}=r;if(!e||!sv(e)||!i)return;let{index:a,group:l,target:s}=e.sortable,c=g!==a||m!==l,u=c?s:null==t?void 0:t.element;if(!u)return;i2(u);let d=new i7(u);if(!d)return;let p=n9.delta(d,n9.from(i.current.boundingRectangle),e.alignment);n.move({by:p}),c?n.setDropTarget(e.id).then(()=>o.enable()):o.enable()})})});this.destroy=()=>{r(),t()}}},sm=Object.defineProperty,s_=Object.defineProperties,sb=Object.getOwnPropertyDescriptors,sx=Object.getOwnPropertySymbols,sy=Object.prototype.hasOwnProperty,sk=Object.prototype.propertyIsEnumerable,sw=(e,t,r)=>t in e?sm(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,sS=(e,t)=>{for(var r in t||(t={}))sy.call(t,r)&&sw(e,r,t[r]);if(sx)for(var r of sx(t))sk.call(t,r)&&sw(e,r,t[r]);return e};function sI(e,t,r){if(t===r)return e;let n=e.slice();return n.splice(r,0,n.splice(t,1)[0]),n}function sj(e){return"initialIndex"in e&&"number"==typeof e.initialIndex&&"index"in e&&"number"==typeof e.index}var sz="__default__";function sE(e,t,r,n){r.insertAdjacentElement(n<t?"afterend":"beforebegin",e)}function sC(e,t){return e.index-t.index}function sA(e){return Array.from(e).sort(sC)}var sP=[sg,class extends oD{constructor(e){super(e);const t=()=>{let t=new Map;for(let r of e.registry.droppables)if(r instanceof sN){let{sortable:e}=r,{group:n}=e,o=t.get(n);o||(o=new Set,t.set(n,o)),o.add(e)}for(let[e,r]of t)t.set(e,new Set(sA(r)));return t},r=[e.monitor.addEventListener("dragover",(e,r)=>{if(this.disabled)return;let{dragOperation:n}=r,{source:o,target:i}=n;if(!sv(o)||!sv(i)||o.sortable===i.sortable)return;let a=t(),l=o.sortable.group===i.sortable.group,s=a.get(o.sortable.group),c=l?s:a.get(i.sortable.group);s&&c&&queueMicrotask(()=>{e.defaultPrevented||r.renderer.rendering.then(()=>{var n,u,d;let p=t();for(let[e,t]of a.entries())for(let[r,o]of Array.from(t).entries())if(o.index!==r||o.group!==e||!(null==(n=p.get(e))?void 0:n.has(o)))return;let h=o.sortable.element,f=i.sortable.element;if(!f||!h||!l&&i.id===o.sortable.group)return;let v=sA(s),g=l?v:sA(c),m=null!=(u=o.sortable.group)?u:sz,_=null!=(d=i.sortable.group)?d:sz,b={[m]:v,[_]:g},y=function(e,t,r){var n,o,i;let a,l,{source:s,target:c,canceled:u}=t.operation;if(!s||!c||u)return"preventDefault"in t&&t.preventDefault(),e;let d=(e,t)=>e===t||"object"==typeof e&&"id"in e&&e.id===t;if(Array.isArray(e)){let n=e.findIndex(e=>d(e,s.id)),o=e.findIndex(e=>d(e,c.id));if(-1===n||-1===o){if(sj(s)){let n=s.initialIndex,o=s.index;return n===o||n<0||n>=e.length?("preventDefault"in t&&t.preventDefault(),e):r(e,n,o)}return e}if(!u&&"index"in s&&"number"==typeof s.index){let t=s.index;if(t!==n)return r(e,n,t)}return r(e,n,o)}let p=Object.entries(e),h=-1,f=-1;for(let[e,t]of p)if(-1===h&&-1!==(h=t.findIndex(e=>d(e,s.id)))&&(a=e),-1===f&&-1!==(f=t.findIndex(e=>d(e,c.id)))&&(l=e),-1!==h&&-1!==f)break;if(-1===h&&sj(s)){let n=s.initialGroup,o=s.initialIndex,i=s.group,a=s.index;if(null==n||null==i||!(n in e)||!(i in e)||n===i&&o===a)return"preventDefault"in t&&t.preventDefault(),e;if(n===i)return s_(sS({},e),sb({[n]:r(e[n],o,a)}));let l=e[n][o];return s_(sS({},e),sb({[n]:[...e[n].slice(0,o),...e[n].slice(o+1)],[i]:[...e[i].slice(0,a),l,...e[i].slice(a)]}))}if(!s.manager)return e;let{dragOperation:v}=s.manager,g=null!=(o=null==(n=v.shape)?void 0:n.current.center)?o:v.position.current;if(null==l&&c.id in e){let t=c.shape&&g.y>c.shape.center.y?e[c.id].length:0;l=c.id,f=t}if(null==a||null==l||a===l&&h===f){if(null!=a&&a===l&&h===f&&sj(s)){let t=null!=s.group&&s.group!==a,n=s.index!==h;if(t||n){let t=null!=(i=s.group)?i:a;if(t in e){if(a===t)return s_(sS({},e),sb({[a]:r(e[a],h,s.index)}));let n=e[a][h];return s_(sS({},e),sb({[a]:[...e[a].slice(0,h),...e[a].slice(h+1)],[t]:[...e[t].slice(0,s.index),n,...e[t].slice(s.index)]}))}}}return"preventDefault"in t&&t.preventDefault(),e}if(a===l)return s_(sS({},e),sb({[a]:r(e[a],h,f)}));let m=+!!(c.shape&&Math.round(g.y)>Math.round(c.shape.center.y)),_=e[a][h];return s_(sS({},e),sb({[a]:[...e[a].slice(0,h),...e[a].slice(h+1)],[l]:[...e[l].slice(0,f+m),_,...e[l].slice(f+m)]}))}(b,e,sI);if(b===y)return;let k=y[_].indexOf(o.sortable),w=y[_].indexOf(i.sortable);r.collisionObserver.disable(),sE(h,k,f,w),rX(()=>{for(let[e,t]of y[m].entries())t.index=e;if(!l)for(let[e,t]of y[_].entries())t.group=i.sortable.group,t.index=e}),r.actions.setDropTarget(o.id).then(()=>r.collisionObserver.enable())})})}),e.monitor.addEventListener("dragend",(e,r)=>{if(!e.canceled)return;let{dragOperation:n}=r,{source:o}=n;sv(o)&&(o.sortable.initialIndex!==o.sortable.index||o.sortable.initialGroup!==o.sortable.group)&&queueMicrotask(()=>{let e=t(),n=e.get(o.sortable.initialGroup);n&&r.renderer.rendering.then(()=>{for(let[t,r]of e.entries())for(let[e,n]of Array.from(r).entries())if(n.index!==e||n.group!==t)return;let t=sA(n),r=o.sortable.element,i=t[o.sortable.initialIndex],a=null==i?void 0:i.element;i&&a&&r&&(sE(r,i.index,a,o.index),rX(()=>{for(let[t,r]of e.entries())for(let e of Array.from(r).values())e.index=e.initialIndex,e.group=e.initialGroup}))})})})];this.destroy=()=>{for(let e of r)e()}}}],sM={duration:250,easing:"cubic-bezier(0.25, 1, 0.5, 1)",idle:!1},sO=new nR;rc=[nO],rs=[nO];var sD=class{constructor(e,t){sh(this,rd,sc(ru,8,this)),sc(ru,11,this),sh(this,rp),sh(this,rh),sh(this,rf,sc(ru,12,this)),sc(ru,15,this),sh(this,rv),this.register=()=>(rX(()=>{var e,t;null==(e=this.manager)||e.registry.register(this.droppable),null==(t=this.manager)||t.registry.register(this.draggable)}),()=>this.unregister()),this.unregister=()=>{rX(()=>{var e,t;null==(e=this.manager)||e.registry.unregister(this.droppable),null==(t=this.manager)||t.registry.unregister(this.draggable)})},this.destroy=()=>{rX(()=>{this.droppable.destroy(),this.draggable.destroy()})};var{effects:r=()=>[],group:n,index:o,sensors:i,type:a,transition:l=sM,plugins:s}=e,c=((e,t)=>{var r={};for(var n in e)st.call(e,n)&&0>t.indexOf(n)&&(r[n]=e[n]);if(null!=e&&se)for(var n of se(e))0>t.indexOf(n)&&sr.call(e,n)&&(r[n]=e[n]);return r})(e,["effects","group","index","sensors","type","transition","plugins"]);const u=o5(s,sP);this.droppable=new sN(c,t,this),this.draggable=new sT(((e,t)=>l8(e,l7(t)))(si({},c),{plugins:u,effects:()=>[()=>{var e,t,r;let n=null==(e=this.manager)?void 0:e.dragOperation.status;(null==n?void 0:n.initializing)&&this.id===(null==(r=null==(t=this.manager)?void 0:t.dragOperation.source)?void 0:r.id)&&sO.clear(this.manager),(null==n?void 0:n.dragging)&&sO.set(this.manager,this.id,rG(()=>({initialIndex:this.index,initialGroup:this.group})))},()=>{let{index:e,group:t,manager:r}=this,n=sp(this,rh),o=sp(this,rp);(e!==n||t!==o)&&(sf(this,rh,e),sf(this,rp,t),this.animate())},()=>{var e,t;let{target:r}=this,{isDragSource:n}=this.draggable;"move"===(null!=(t=null==(e=this.draggable.pluginConfig(aQ))?void 0:e.feedback)?t:"default")&&n&&(this.droppable.disabled=!r)},...r()],type:a,sensors:i}),t,this),sf(this,rv,c.element),this.manager=t,this.index=o,sf(this,rh,o),this.group=n,sf(this,rp,n),this.type=a,this.transition=l}get initialIndex(){var e,t;return null!=(t=null==(e=sO.get(this.manager,this.id))?void 0:e.initialIndex)?t:this.index}get initialGroup(){var e,t;return null!=(t=null==(e=sO.get(this.manager,this.id))?void 0:e.initialGroup)?t:this.group}animate(){rG(()=>{let{manager:e,transition:t}=this,{shape:r}=this.droppable;if(!e)return;let{idle:n}=e.dragOperation.status;r&&t&&(!n||t.idle)&&e.renderer.rendering.then(()=>{let{element:n}=this;if(!n)return;for(let e of n.getAnimations())"transitionProperty"in e&&("transform"===e.transitionProperty||"translate"===e.transitionProperty||"scale"===e.transitionProperty)&&e.cancel();let o=this.refreshShape();if(!o)return;let i={x:r.boundingRectangle.left-o.boundingRectangle.left,y:r.boundingRectangle.top-o.boundingRectangle.top},{translate:a}=iU(n),l=i6(n,a,!1),s=i6(n,a);if(i.x||i.y){let r=iw(iu(n))?l8(si({},t),l7({duration:0})):t;i3({element:n,keyframes:{translate:[`${l.x+i.x}px ${l.y+i.y}px ${l.z}`,`${s.x}px ${s.y}px ${s.z}`]},options:r}).then(()=>{e.dragOperation.status.dragging||(this.droppable.shape=void 0)})}})})}get manager(){return this.draggable.manager}set manager(e){rX(()=>{this.draggable.manager=e,this.droppable.manager=e})}set element(e){rX(()=>{let t=sp(this,rv),r=this.droppable.element,n=this.draggable.element;r&&r!==t||(this.droppable.element=e),n&&n!==t||(this.draggable.element=e),sf(this,rv,e)})}get element(){var e,t;let r=sp(this,rv);if(r)return null!=(t=null!=(e=ij.get(r))?e:r)?t:this.droppable.element}set target(e){this.droppable.element=e}get target(){return this.droppable.element}set source(e){this.draggable.element=e}get source(){return this.draggable.element}get disabled(){return this.draggable.disabled&&this.droppable.disabled}set plugins(e){this.draggable.plugins=o5(e,sP)}set disabled(e){rX(()=>{this.droppable.disabled=e,this.draggable.disabled=e})}set data(e){rX(()=>{this.droppable.data=e,this.draggable.data=e})}set handle(e){this.draggable.handle=e}set id(e){this.droppable.id=e,this.draggable.id=e}get id(){return this.droppable.id}set sensors(e){this.draggable.sensors=e}set modifiers(e){this.draggable.modifiers=e}set collisionPriority(e){this.droppable.collisionPriority=e}set collisionDetector(e){this.droppable.collisionDetector=null!=e?e:aa}set alignment(e){this.draggable.alignment=e}get alignment(){return this.draggable.alignment}set type(e){rX(()=>{this.droppable.type=e,this.draggable.type=e})}get type(){return this.draggable.type}set accept(e){this.droppable.accept=e}get accept(){return this.droppable.accept}get isDropTarget(){return this.droppable.isDropTarget}get isDragSource(){return this.draggable.isDragSource}get isDragging(){return this.draggable.isDragging}get isDropping(){return this.draggable.isDropping}get status(){return this.draggable.status}refreshShape(){return this.droppable.refreshShape()}accepts(e){return this.droppable.accepts(e)}};ru=[,,,l6(null)],rd=new WeakMap,rp=new WeakMap,rh=new WeakMap,rf=new WeakMap,rv=new WeakMap,su(ru,4,"index",rc,sD,rd),su(ru,4,"group",rs,sD,rf),v=ru,so(sD,(o="metadata",(i=Symbol[o])?i:Symbol.for("Symbol."+o)),v[3]);var sT=class extends l_{constructor(e,t,r){super(e,t),this.sortable=r}get index(){return this.sortable.index}get initialIndex(){return this.sortable.initialIndex}get group(){return this.sortable.group}get initialGroup(){return this.sortable.initialGroup}},sN=class extends lb{constructor(e,t,r){super(e,t),this.sortable=r}get index(){return this.sortable.index}get group(){return this.sortable.group}},sL=Object.defineProperty,sB=Object.defineProperties,sR=Object.getOwnPropertyDescriptors,sF=Object.getOwnPropertySymbols,sV=Object.prototype.hasOwnProperty,s$=Object.prototype.propertyIsEnumerable,sW=(e,t,r)=>t in e?sL(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,sH=(e,t)=>{for(var r in t||(t={}))sV.call(t,r)&&sW(e,r,t[r]);if(sF)for(var r of sF(t))s$.call(t,r)&&sW(e,r,t[r]);return e};function sq(e){let{accept:t,collisionDetector:r,collisionPriority:n,id:o,data:i,element:a,handle:l,index:s,group:c,disabled:u,modifiers:d,sensors:p,target:h,type:f,plugins:v}=e,g=sH(sH({},sM),e.transition),m=l$(t=>new sD(sB(sH({},e),sR({transition:g,register:!1,handle:ly(l),element:ly(a),target:ly(h)})),t)),_=lw(m,sU);return lj(o,()=>m.id=o),lk(()=>{rX(()=>{m.group=c,m.index=s})},[m,c,s]),lj(f,()=>m.type=f),lj(t,()=>m.accept=t,void 0,nM),lj(i,()=>i&&(m.data=i)),lj(s,()=>{var e;(null==(e=m.manager)?void 0:e.dragOperation.status.idle)&&(null==g?void 0:g.idle)&&m.refreshShape()},lS),lz(l,e=>m.handle=e),lz(a,e=>m.element=e),lz(h,e=>m.target=e),lj(u,()=>m.disabled=!0===u),lj(p,()=>m.sensors=p),lj(r,()=>m.collisionDetector=r),lj(n,()=>m.collisionPriority=n),lj(v,()=>m.plugins=v,void 0,nM),lj(g,()=>m.transition=g,void 0,nM),lj(d,()=>m.modifiers=d,void 0,nM),lj(e.alignment,()=>m.alignment=e.alignment),{sortable:_,get isDragging(){return _.isDragging},get isDropping(){return _.isDropping},get isDragSource(){return _.isDragSource},get isDropTarget(){return _.isDropTarget},handleRef:(0,r_.useCallback)(e=>{m.handle=null!=e?e:void 0},[m]),ref:(0,r_.useCallback)(e=>{var t,r;(e||null==(t=m.element)||!t.isConnected||(null==(r=m.manager)?void 0:r.dragOperation.status.idle))&&(m.element=null!=e?e:void 0)},[m]),sourceRef:(0,r_.useCallback)(e=>{var t,r;(e||null==(t=m.source)||!t.isConnected||(null==(r=m.manager)?void 0:r.dragOperation.status.idle))&&(m.source=null!=e?e:void 0)},[m]),targetRef:(0,r_.useCallback)(e=>{var t,r;(e||null==(t=m.target)||!t.isConnected||(null==(r=m.manager)?void 0:r.dragOperation.status.idle))&&(m.target=null!=e?e:void 0)},[m])}}function sU(e,t,r){return"isDragSource"===e&&!r&&!!t}var sZ=e.i(968673),sY=e.i(481697);function sX(e,t,r){let n,o=r.initialDeps??[],i=!0;function a(){let a=e();return(a.length!==o.length||a.some((e,t)=>o[t]!==e))&&(o=a,n=t(...a),(null==r?void 0:r.onChange)&&!(i&&r.skipInitialOnChange)&&r.onChange(n),i=!1),n}return a.updateDeps=e=>{o=e},a}function sK(e,t){if(void 0!==e)return e;throw Error(`Unexpected undefined${t?`: ${t}`:""}`)}let sJ=()=>{if(void 0!==t)return t;if("u"<typeof navigator)return t=!1;if(/iP(hone|od|ad)/.test(navigator.userAgent))return t=!0;let e=navigator.maxTouchPoints;return t="MacIntel"===navigator.platform&&void 0!==e&&e>0},sG=e=>{let{offsetWidth:t,offsetHeight:r}=e;return{width:t,height:r}},sQ=e=>e,s0=e=>{let t=Math.max(e.startIndex-e.overscan,0),r=Math.min(e.endIndex+e.overscan,e.count-1)-t+1,n=Array(r);for(let e=0;e<r;e++)n[e]=t+e;return n},s1=(e,t)=>{let r=e.scrollElement;if(!r)return;let n=e.targetWindow;if(!n)return;let o=e=>{let{width:r,height:n}=e;t({width:Math.round(r),height:Math.round(n)})};if(o(sG(r)),!n.ResizeObserver)return()=>{};let i=new n.ResizeObserver(t=>{let n=()=>{let e=t[0];if(null==e?void 0:e.borderBoxSize){let t=e.borderBoxSize[0];if(t)return void o({width:t.inlineSize,height:t.blockSize})}o(sG(r))};e.options.useAnimationFrameWithResizeObserver?requestAnimationFrame(n):n()});return i.observe(r,{box:"border-box"}),()=>{i.unobserve(r)}},s2={passive:!0},s4="u"<typeof window||"onscrollend"in window,s3=(e,t,r)=>{var n,o;let i,a=e.scrollElement;if(!a)return;let l=e.targetWindow;if(!l)return;let s=e.options.useScrollendEvent&&s4,c=0,u=s?null:(n=()=>t(c,!1),o=e.options.isScrollingResetDelay,Object.assign(function(...e){l.clearTimeout(i),i=l.setTimeout(()=>n.apply(this,e),o)},{cancel:()=>{l.clearTimeout(i)}})),d=e=>()=>{c=r(a),null==u||u(),t(c,e)},p=d(!0),h=d(!1);return a.addEventListener("scroll",p,s2),s&&a.addEventListener("scrollend",h,s2),()=>{a.removeEventListener("scroll",p),s&&a.removeEventListener("scrollend",h),null==u||u.cancel()}},s6=(e,t)=>s3(e,t,t=>{let{horizontal:r,isRtl:n}=e.options;return r?t.scrollLeft*(n&&-1||1):t.scrollTop}),s5=(e,t,r)=>{if(r.options.useCachedMeasurements){let t=r.indexFromElement(e),n=r.options.getItemKey(t);return r.itemSizeCache.get(n)??r.options.estimateSize(t)}if(null==t?void 0:t.borderBoxSize){let e=t.borderBoxSize[0];if(e)return Math.round(e[r.options.horizontal?"inlineSize":"blockSize"])}if(!t){let t=r.indexFromElement(e),n=r.options.getItemKey(t),o=r.itemSizeCache.get(n);if(void 0!==o)return o}return e[r.options.horizontal?"offsetWidth":"offsetHeight"]},s8=(e,{adjustments:t=0,behavior:r},n)=>{var o,i;null==(i=null==(o=n.scrollElement)?void 0:o.scrollTo)||i.call(o,{[n.options.horizontal?"left":"top"]:e+t,behavior:r})};class s9{constructor(e){this.unsubs=[],this.scrollElement=null,this.targetWindow=null,this.isScrolling=!1,this.scrollState=null,this.measurementsCache=[],this._flatMeasurements=null,this.itemSizeCache=new Map,this.itemSizeCacheVersion=0,this.laneAssignments=new Map,this.pendingMin=null,this.prevLanes=void 0,this.lanesChangedFlag=!1,this.lanesSettling=!1,this.pendingScrollAnchor=null,this.scrollRect=null,this.scrollOffset=null,this.scrollDirection=null,this.scrollAdjustments=0,this._iosDeferredAdjustment=0,this._iosTouching=!1,this._iosJustTouchEnded=!1,this._iosTouchEndTimerId=null,this._intendedScrollOffset=null,this.elementsCache=new Map,this.now=()=>{var e,t,r;return(null==(r=null==(t=null==(e=this.targetWindow)?void 0:e.performance)?void 0:t.now)?void 0:r.call(t))??Date.now()},this.observer=(()=>{let e=null,t=()=>e||(this.targetWindow&&this.targetWindow.ResizeObserver?e=new this.targetWindow.ResizeObserver(e=>{e.forEach(e=>{let t=()=>{let t=e.target,r=this.indexFromElement(t);if(!t.isConnected){for(let[e,r]of(this.observer.unobserve(t),this.elementsCache))if(r===t){this.elementsCache.delete(e);break}return}this.isIndexInRange(r)&&this.shouldMeasureDuringScroll(r)&&this.resizeItem(r,this.options.measureElement(t,e,this))};this.options.useAnimationFrameWithResizeObserver?requestAnimationFrame(t):t()})}):null);return{disconnect:()=>{var r;null==(r=t())||r.disconnect(),e=null},observe:e=>{var r;return null==(r=t())?void 0:r.observe(e,{box:"border-box"})},unobserve:e=>{var r;return null==(r=t())?void 0:r.unobserve(e)}}})(),this.range=null,this.setOptions=e=>{var t,r;let n={debug:!1,initialOffset:0,overscan:1,paddingStart:0,paddingEnd:0,scrollPaddingStart:0,scrollPaddingEnd:0,horizontal:!1,getItemKey:sQ,rangeExtractor:s0,onChange:()=>{},measureElement:s5,initialRect:{width:0,height:0},scrollMargin:0,gap:0,indexAttribute:"data-index",initialMeasurementsCache:[],lanes:1,anchorTo:"start",followOnAppend:!1,scrollEndThreshold:1,isScrollingResetDelay:150,enabled:!0,isRtl:!1,useScrollendEvent:!1,useAnimationFrameWithResizeObserver:!1,laneAssignmentMode:"estimate",useCachedMeasurements:!1};for(let t in e){let r=e[t];void 0!==r&&(n[t]=r)}let o=this.options,i=null,a=null,l=!1;if(void 0!==o&&o.enabled&&n.enabled&&"end"===n.anchorTo&&null!==this.scrollElement){let e=o.count,s=n.count,c=this.getMeasurements(),u=e>0?(null==(t=c[0])?void 0:t.key)??o.getItemKey(0):null,d=e>0?(null==(r=c[e-1])?void 0:r.key)??o.getItemKey(e-1):null;if(s!==e||e>0&&s>0&&(n.getItemKey(0)!==u||n.getItemKey(s-1)!==d)){l=!0;let t=e>0?this.getVirtualItemForOffset(this.getScrollOffset())??c[0]:null;t&&(i=[t.key,this.getScrollOffset()-t.start]);let r=!0===n.followOnAppend?"auto":n.followOnAppend||null;r&&s>e&&this.isAtEnd(o.scrollEndThreshold)&&(0===e||n.getItemKey(s-1)!==d)&&(a=r)}}this.options=n,l&&(this.pendingMin=0,this.itemSizeCacheVersion++);let s=!1,c=0;if(i&&null!==this.scrollOffset){let[e,t]=i,r=this.getMeasurements(),{count:n,getItemKey:o}=this.options,a=0;for(;a<n&&o(a)!==e;)a++;if(a<n){let e=r[a];if(e){let r=Math.max(0,e.start+t);r!==this.scrollOffset&&(c=r-this.scrollOffset,this.scrollOffset=r,s=!0)}}}(s||a)&&(this.pendingScrollAnchor=[s?i[0]:null,s?i[1]:0,a,c])},this.notify=e=>{var t,r;null==(r=(t=this.options).onChange)||r.call(t,this,e)},this.maybeNotify=sX(()=>(this.calculateRange(),[this.isScrolling,this.range?this.range.startIndex:null,this.range?this.range.endIndex:null]),e=>{this.notify(e)},{key:!1,debug:()=>this.options.debug,initialDeps:[this.isScrolling,this.range?this.range.startIndex:null,this.range?this.range.endIndex:null]}),this.cleanup=()=>{this.unsubs.filter(Boolean).forEach(e=>e()),this.unsubs=[],this.observer.disconnect(),null!=this.rafId&&this.targetWindow&&(this.targetWindow.cancelAnimationFrame(this.rafId),this.rafId=null),this.scrollState=null,this.isScrolling=!1,this.scrollDirection=null,this._iosDeferredAdjustment=0,this._iosTouching=!1,this._iosJustTouchEnded=!1,this.scrollElement=null,this.targetWindow=null},this._didMount=()=>()=>{this.cleanup()},this._willUpdate=()=>{var e;let t=this.options.enabled?this.options.getScrollElement():null;if(this.scrollElement!==t){if(this.cleanup(),!t)return void this.maybeNotify();if(this.scrollElement=t,this.scrollElement&&"ownerDocument"in this.scrollElement?this.targetWindow=this.scrollElement.ownerDocument.defaultView:this.targetWindow=(null==(e=this.scrollElement)?void 0:e.window)??null,this.elementsCache.forEach(e=>{this.observer.observe(e)}),this.unsubs.push(this.options.observeElementRect(this,e=>{this.scrollRect=e,this.maybeNotify()})),this.unsubs.push(this.options.observeElementOffset(this,(e,t)=>{if(t&&null===this._intendedScrollOffset&&e===this.scrollOffset)return;null!==this._intendedScrollOffset&&1.5>Math.abs(e-this._intendedScrollOffset)&&(e=this._intendedScrollOffset),this._intendedScrollOffset=null,this.scrollAdjustments=0;let r=this.getScrollOffset();this.scrollDirection=t?r===e?this.scrollDirection:r<e?"forward":"backward":null,this.scrollOffset=e,this.isScrolling=t,this._flushIosDeferredIfReady(),this.scrollState&&this.scheduleScrollReconcile(),this.maybeNotify()})),"addEventListener"in this.scrollElement){let e=this.scrollElement,t=()=>{this._iosTouching=!0,this._iosJustTouchEnded=!1,null!==this._iosTouchEndTimerId&&null!=this.targetWindow&&(this.targetWindow.clearTimeout(this._iosTouchEndTimerId),this._iosTouchEndTimerId=null)},r=()=>{this._iosTouching=!1,sJ()&&null!=this.targetWindow&&(this._iosJustTouchEnded=!0,this._iosTouchEndTimerId=this.targetWindow.setTimeout(()=>{this._iosJustTouchEnded=!1,this._iosTouchEndTimerId=null,this._flushIosDeferredIfReady()},150))};e.addEventListener("touchstart",t,s2),e.addEventListener("touchend",r,s2),this.unsubs.push(()=>{e.removeEventListener("touchstart",t),e.removeEventListener("touchend",r),null!==this._iosTouchEndTimerId&&null!=this.targetWindow&&(this.targetWindow.clearTimeout(this._iosTouchEndTimerId),this._iosTouchEndTimerId=null)})}this._scrollToOffset(this.getScrollOffset(),{adjustments:void 0,behavior:void 0})}let r=this.pendingScrollAnchor;if(this.pendingScrollAnchor=null,r&&this.scrollElement&&this.options.enabled){let[e,t,n,o]=r;null===e||n||(sJ()&&(this.isScrolling||this._iosTouching||this._iosJustTouchEnded)?0!==o&&(this._iosDeferredAdjustment+=o):this._scrollToOffset(this.getScrollOffset(),{adjustments:void 0,behavior:void 0})),n&&this.scrollToEnd({behavior:n})}},this._flushIosDeferredIfReady=()=>{if(0===this._iosDeferredAdjustment||this.isScrolling||this._iosTouching||this._iosJustTouchEnded)return;let e=this.getScrollOffset(),t=this.getMaxScrollOffset();if(e<0||e>t)return;if(this._iosDeferredAdjustment<0&&e>=t-1){this._iosDeferredAdjustment=0;return}let r=this._iosDeferredAdjustment;this._iosDeferredAdjustment=0,this._scrollToOffset(e,{adjustments:this.scrollAdjustments+=r,behavior:void 0})},this.rafId=null,this.getSize=()=>this.options.enabled?(this.scrollRect=this.scrollRect??this.options.initialRect,this.scrollRect[this.options.horizontal?"width":"height"]):(this.scrollRect=null,0),this.getScrollOffset=()=>this.options.enabled?(this.scrollOffset=this.scrollOffset??("function"==typeof this.options.initialOffset?this.options.initialOffset():this.options.initialOffset),this.scrollOffset):(this.scrollOffset=null,0),this.getMeasurementOptions=sX(()=>[this.options.count,this.options.paddingStart,this.options.scrollMargin,this.options.getItemKey,this.options.enabled,this.options.lanes,this.options.laneAssignmentMode,this.options.gap],(e,t,r,n,o,i,a,l)=>(void 0!==this.prevLanes&&this.prevLanes!==i&&(this.lanesChangedFlag=!0),this.prevLanes=i,this.pendingMin=null,{count:e,paddingStart:t,scrollMargin:r,getItemKey:n,enabled:o,lanes:i,laneAssignmentMode:a,gap:l}),{key:!1}),this.isIndexInRange=e=>e>=0&&e<this.options.count,this.getMeasurements=sX(()=>[this.getMeasurementOptions(),this.itemSizeCacheVersion],({count:e,paddingStart:t,scrollMargin:r,getItemKey:n,enabled:o,lanes:i,laneAssignmentMode:a,gap:l},s)=>{let c=this.itemSizeCache;if(!o)return this.measurementsCache=[],this.itemSizeCache.clear(),this.laneAssignments.clear(),[];if(this.laneAssignments.size>e)for(let t of this.laneAssignments.keys())t>=e&&this.laneAssignments.delete(t);this.lanesChangedFlag&&(this.lanesChangedFlag=!1,this.lanesSettling=!0,this.measurementsCache=[],this.itemSizeCache.clear(),this.laneAssignments.clear(),this.pendingMin=null),0!==this.measurementsCache.length||this.lanesSettling||(this.measurementsCache=this.options.initialMeasurementsCache,this.measurementsCache.forEach(e=>{this.itemSizeCache.set(e.key,e.size)}));let u=this.lanesSettling?0:this.pendingMin??0;if(this.pendingMin=null,this.lanesSettling&&this.measurementsCache.length===e&&(this.lanesSettling=!1),1===i){var d;let o,i=2*e,a=this._flatMeasurements;if(!a||a.length<i){let e=new Float64Array(i);a&&u>0&&e.set(a.subarray(0,2*u)),a=e,this._flatMeasurements=a}if(0===u)o=t+r;else{let e=u-1;o=a[2*e]+a[2*e+1]+l}for(let t=u;t<e;t++){let e=n(t),r=c.get(e),i="number"==typeof r?r:this.options.estimateSize(t);a[2*t]=o,a[2*t+1]=i,o+=i+l}let s=(d=a,new Proxy(Array(e),{get(t,r,o){if("string"==typeof r){let o=r.charCodeAt(0);if(o>=48&&o<=57){let o=+r;if(Number.isInteger(o)&&o>=0&&o<e){let e=t[o];if(!e){let r=d[2*o];e=t[o]={index:o,key:n(o),start:r,size:d[2*o+1],end:r+d[2*o+1],lane:0}}return e}}if("length"===r)return e}return Reflect.get(t,r,o)}}));return this.measurementsCache=s,s}let p=this.measurementsCache.slice(0,u),h=Array(i).fill(void 0),f=new Float64Array(i),v=0;for(let e=0;e<u;e++){let t=p[e];t&&(void 0===h[t.lane]&&v++,h[t.lane]=e,f[t.lane]=t.end)}for(let o=u;o<e;o++){let e,s,u=n(o),d=this.laneAssignments.get(o),g="estimate"===a||c.has(u);if(void 0!==d&&this.options.lanes>1){let n=h[e=d],o=void 0!==n?p[n]:void 0;s=o?o.end+l:t+r}else if(v===i){let t=0,r=f[0],n=h[0];for(let e=1;e<i;e++){let o=f[e];(o<r||o===r&&h[e]<n)&&(t=e,r=o,n=h[e])}e=t,s=r+l,g&&this.laneAssignments.set(o,e)}else e=o%this.options.lanes,s=t+r,g&&this.laneAssignments.set(o,e);let m=c.get(u),_="number"==typeof m?m:this.options.estimateSize(o),b=s+_;p[o]={index:o,start:s,size:_,end:b,key:u,lane:e},void 0===h[e]&&v++,h[e]=o,f[e]=b}return this.measurementsCache=p,p},{key:!1,debug:()=>this.options.debug}),this.calculateRange=sX(()=>[this.getMeasurements(),this.getSize(),this.getScrollOffset(),this.options.lanes],(e,t,r,n)=>0===e.length||0===t?(this.range=null,null):(this.range=function(e,t,r,n,o){let i=e.length-1;if(e.length<=n)return{startIndex:0,endIndex:i};if(1===n&&null!==o){let e=function(e,t,r){let n=0;for(;n<=t;){let o=(n+t)/2|0,i=e[2*o];if(i<r)n=o+1;else{if(!(i>r))return o;t=o-1}}return n>0?n-1:0}(o,i,r),n=e,a=r+t;for(;n<i&&o[2*n]+o[2*n+1]<a;)n++;return{startIndex:e,endIndex:n}}let a=s7(0,i,t=>e[t].start,r),l=a;if(1===n)for(;l<i&&e[l].end<r+t;)l++;else if(n>1){let o=Array(n).fill(0);for(;l<i&&o.some(e=>e<r+t);){let t=e[l];o[t.lane]=t.end,l++}let s=Array(n).fill(r+t);for(;a>=0&&s.some(e=>e>=r);){let t=e[a];s[t.lane]=t.start,a--}a=Math.max(0,a-a%n),l=Math.min(i,l+(n-1-l%n))}return{startIndex:a,endIndex:l}}(e,t,r,n,1===n&&null!=this._flatMeasurements?this._flatMeasurements:null),this.range),{key:!1,debug:()=>this.options.debug}),this.getVirtualIndexes=sX(()=>{let e=null,t=null,r=this.calculateRange();return r&&(e=r.startIndex,t=r.endIndex),this.maybeNotify.updateDeps([this.isScrolling,e,t]),[this.options.rangeExtractor,this.options.overscan,this.options.count,e,t]},(e,t,r,n,o)=>null===n||null===o?[]:e({startIndex:n,endIndex:o,overscan:t,count:r}),{key:!1,debug:()=>this.options.debug}),this.indexFromElement=e=>{let t=this.options.indexAttribute,r=e.getAttribute(t);return r?parseInt(r,10):(console.warn(`Missing attribute name '${t}={index}' on measured element.`),-1)},this.shouldMeasureDuringScroll=e=>{var t;if(!this.scrollState||"smooth"!==this.scrollState.behavior)return!0;let r=this.scrollState.index??(null==(t=this.getVirtualItemForOffset(this.scrollState.lastTargetOffset))?void 0:t.index);if(void 0!==r&&this.range){let t=Math.max(this.options.overscan,Math.ceil((this.range.endIndex-this.range.startIndex)/2)),n=Math.max(0,r-t),o=Math.min(this.options.count-1,r+t);return e>=n&&e<=o}return!0},this.measureElement=e=>{if(!e)return void this.elementsCache.forEach((e,t)=>{e.isConnected||(this.observer.unobserve(e),this.elementsCache.delete(t))});let t=this.indexFromElement(e);if(!this.isIndexInRange(t))return;let r=this.options.getItemKey(t),n=this.elementsCache.get(r);n!==e&&(n&&this.observer.unobserve(n),this.observer.observe(e),this.elementsCache.set(r,e)),(!this.isScrolling||this.scrollState)&&this.shouldMeasureDuringScroll(t)&&this.resizeItem(t,this.options.measureElement(e,void 0,this))},this.resizeItem=(e,t)=>{var r,n;let o,i,a;if(!this.isIndexInRange(e))return;let l=this._flatMeasurements;if(1===this.options.lanes&&null!==l)a=this.options.getItemKey(e),i=l[2*e],o=l[2*e+1];else{let t=this.measurementsCache[e];if(!t)return;a=t.key,i=t.start,o=t.size}let s=this.itemSizeCache.get(a)??o,c=t-s;if(0!==c){let l="end"===this.options.anchorTo&&(null==(r=this.scrollState)?void 0:r.behavior)!=="smooth"&&this.getVirtualDistanceFromEnd()<=this.options.scrollEndThreshold,u=l?this.getTotalSize():0,d=this.getScrollOffset()+this.scrollAdjustments,p=this.itemSizeCache.has(a)?i+s<=d&&"backward"!==this.scrollDirection:i<d,h=(null==(n=this.scrollState)?void 0:n.behavior)!=="smooth"&&(void 0!==this.shouldAdjustScrollPositionOnItemSizeChange?this.shouldAdjustScrollPositionOnItemSizeChange(this.measurementsCache[e]??{index:e,key:a,start:i,size:o,end:i+o,lane:0},c,this):p);(null===this.pendingMin||e<this.pendingMin)&&(this.pendingMin=e),this.itemSizeCache.set(a,t),this.itemSizeCacheVersion++;let f=!1;l?f=this.applyScrollAdjustment(this.getTotalSize()-u):h&&(f=this.applyScrollAdjustment(c)),this.notify(f)}},this.getVirtualItems=sX(()=>[this.getVirtualIndexes(),this.getMeasurements()],(e,t)=>{let r=[];for(let n=0,o=e.length;n<o;n++){let o=t[e[n]];r.push(o)}return r},{key:!1,debug:()=>this.options.debug}),this.getVirtualItemForOffset=e=>{let t=this.getMeasurements();if(0===t.length)return;let r=this._flatMeasurements,n=1===this.options.lanes&&null!=r,o=s7(0,t.length-1,n?e=>r[2*e]:e=>sK(t[e]).start,e);return sK(t[o])},this.getMaxScrollOffset=()=>{if(!this.scrollElement)return 0;if("scrollHeight"in this.scrollElement)return this.options.horizontal?this.scrollElement.scrollWidth-this.scrollElement.clientWidth:this.scrollElement.scrollHeight-this.scrollElement.clientHeight;{let e=this.scrollElement.document.documentElement;return this.options.horizontal?e.scrollWidth-this.scrollElement.innerWidth:e.scrollHeight-this.scrollElement.innerHeight}},this.getVirtualDistanceFromEnd=()=>Math.max(this.getTotalSize()-this.getSize()-this.getScrollOffset(),0),this.getDistanceFromEnd=()=>Math.max(this.getMaxScrollOffset()-this.getScrollOffset(),0),this.isAtEnd=(e=this.options.scrollEndThreshold)=>this.getDistanceFromEnd()<=e,this.getOffsetForAlignment=(e,t,r=0)=>{if(!this.scrollElement)return 0;let n=this.getSize(),o=this.getScrollOffset();return"auto"===t&&(t=e>=o+n?"end":"start"),"center"===t?e+=(r-n)/2:"end"===t&&(e-=n),Math.max(Math.min(this.getMaxScrollOffset(),e),0)},this.getOffsetForIndex=(e,t="auto")=>{e=Math.max(0,Math.min(e,this.options.count-1));let r=this.getSize(),n=this.getScrollOffset(),o=this.measurementsCache[e];if(!o)return;if("auto"===t)if(o.end>=n+r-this.options.scrollPaddingEnd)t="end";else{if(!(o.start<=n+this.options.scrollPaddingStart))return[n,t];t="start"}if("end"===t&&e===this.options.count-1)return[this.getMaxScrollOffset(),t];let i="end"===t?o.end+this.options.scrollPaddingEnd:o.start-this.options.scrollPaddingStart;return[this.getOffsetForAlignment(i,t,o.size),t]},this.scrollToOffset=(e,{align:t="start",behavior:r="auto"}={})=>{this._iosDeferredAdjustment=0;let n=this.getOffsetForAlignment(e,t),o=this.now();this.scrollState={index:null,align:t,behavior:r,startedAt:o,lastTargetOffset:n,stableFrames:0},this._scrollToOffset(n,{adjustments:void 0,behavior:r}),this.scheduleScrollReconcile()},this.scrollToIndex=(e,{align:t="auto",behavior:r="auto"}={})=>{this._iosDeferredAdjustment=0,e=Math.max(0,Math.min(e,this.options.count-1));let n=this.getOffsetForIndex(e,t);if(!n)return;let[o,i]=n,a=this.now();this.scrollState={index:e,align:i,behavior:r,startedAt:a,lastTargetOffset:o,stableFrames:0},this._scrollToOffset(o,{adjustments:void 0,behavior:r}),this.scheduleScrollReconcile()},this.scrollBy=(e,{behavior:t="auto"}={})=>{let r=this.getScrollOffset()+e,n=this.now();this.scrollState={index:null,align:"start",behavior:t,startedAt:n,lastTargetOffset:r,stableFrames:0},this._scrollToOffset(r,{adjustments:void 0,behavior:t}),this.scheduleScrollReconcile()},this.scrollToEnd=({behavior:e="auto"}={})=>{this.options.count>0?this.scrollToIndex(this.options.count-1,{align:"end",behavior:e}):this.scrollToOffset(Math.max(this.getTotalSize()-this.getSize(),0),{behavior:e})},this.getTotalSize=()=>{var e;let t,r=this.getMeasurements();if(0===r.length)t=this.options.paddingStart;else if(1===this.options.lanes){let n=r.length-1,o=this._flatMeasurements;t=null!=o?o[2*n]+o[2*n+1]:(null==(e=r[n])?void 0:e.end)??0}else{let e=Array(this.options.lanes).fill(null),n=r.length-1;for(;n>=0&&e.some(e=>null===e);){let t=r[n];null===e[t.lane]&&(e[t.lane]=t.end),n--}t=Math.max(...e.filter(e=>null!==e))}return Math.max(t-this.options.scrollMargin+this.options.paddingEnd,0)},this.takeSnapshot=()=>{let e=[];if(0===this.itemSizeCache.size)return e;for(let t of this.getMeasurements())t&&this.itemSizeCache.has(t.key)&&e.push({index:t.index,key:t.key,start:t.start,size:t.size,end:t.end,lane:t.lane});return e},this._scrollToOffset=(e,{adjustments:t,behavior:r})=>{this._intendedScrollOffset=e+(t??0),this.options.scrollToFn(e,{behavior:r,adjustments:t},this)},this.measure=()=>{this.pendingMin=null,this.itemSizeCache.clear(),this.laneAssignments.clear(),this.itemSizeCacheVersion++,this.notify(!1)},this.setOptions(e)}applyScrollAdjustment(e,t){return 0!==e&&(sJ()&&(this.isScrolling||this._iosTouching||this._iosJustTouchEnded)?(this._iosDeferredAdjustment+=e,!1):(this._scrollToOffset(this.getScrollOffset(),{adjustments:this.scrollAdjustments+=e,behavior:t}),null!==this.scrollOffset&&(this.scrollOffset+=this.scrollAdjustments,this.scrollOffset<0&&(this.scrollOffset=0),this.scrollAdjustments=0),!0))}scheduleScrollReconcile(){if(!this.targetWindow){this.scrollState=null;return}null==this.rafId&&(this.rafId=this.targetWindow.requestAnimationFrame(()=>{this.rafId=null,this.reconcileScroll()}))}reconcileScroll(){if(!this.scrollState||!this.scrollElement)return;if(this.now()-this.scrollState.startedAt>5e3){this.scrollState=null;return}let e=null!=this.scrollState.index?this.getOffsetForIndex(this.scrollState.index,this.scrollState.align):void 0,t=e?e[0]:this.scrollState.lastTargetOffset,r=t!==this.scrollState.lastTargetOffset;if(!r&&1.01>Math.abs(t-this.getScrollOffset())){if(this.scrollState.stableFrames++,this.scrollState.stableFrames>=1){this.getScrollOffset()!==t&&this._scrollToOffset(t,{adjustments:void 0,behavior:"auto"}),this.scrollState=null;return}}else if(this.scrollState.stableFrames=0,r){let e=this.getSize()||600,r=Math.abs(t-this.getScrollOffset()),n="smooth"===this.scrollState.behavior&&r>e;this.scrollState.lastTargetOffset=t,n||(this.scrollState.behavior="auto"),this._scrollToOffset(t,{adjustments:void 0,behavior:n?"smooth":"auto"})}this.scheduleScrollReconcile()}}let s7=(e,t,r,n)=>{for(;e<=t;){let o=(e+t)/2|0,i=r(o);if(i<n)e=o+1;else{if(!(i>n))return o;t=o-1}}return e>0?e-1:0},ce="u">typeof document?r_.useLayoutEffect:r_.useEffect;function ct(e){return function({useFlushSync:e=!0,directDomUpdates:t=!1,directDomUpdatesMode:r="transform",...n}){let o=r_.useReducer(e=>e+1,0)[1],i=r_.useRef({enabled:t,mode:r,container:null,lastSize:null,lastPositions:new WeakMap,prevRange:null});i.current.enabled=t,i.current.mode=r;let a=e=>{let t=i.current;if(!t.enabled||!t.container)return;let r=e.getTotalSize();if(r!==t.lastSize){t.lastSize=r;let n=e.options.horizontal?"width":"height";t.container.style[n]=`${r}px`}},l=e=>{let t=i.current;if(!t.enabled||!t.container)return;a(e);let r=!!e.options.horizontal,n="transform"===t.mode,o=r?"left":"top",l=e.options.scrollMargin;for(let i of e.getVirtualItems()){let a=i.start-l,s=e.elementsCache.get(i.key);s&&t.lastPositions.get(s)!==a&&(t.lastPositions.set(s,a),n?s.style.transform=r?`translate3d(${a}px, 0, 0)`:`translate3d(0, ${a}px, 0)`:s.style[o]=`${a}px`)}},s={...n,onChange:(t,r)=>{var a;let s=i.current,c=!0;if(s.enabled){l(t);let e=t.range,r=s.prevRange;(c=!r||r.isScrolling!==t.isScrolling||r.startIndex!==(null==e?void 0:e.startIndex)||r.endIndex!==(null==e?void 0:e.endIndex))&&(s.prevRange=e?{startIndex:e.startIndex,endIndex:e.endIndex,isScrolling:t.isScrolling}:null)}c&&(e&&r?(0,lx.flushSync)(o):o()),null==(a=n.onChange)||a.call(n,t,r)}},[c]=r_.useState(()=>{let e=new s9(s);return Object.assign(e,{containerRef:t=>{let r=i.current;if(r.container=t,r.lastSize=null,t&&r.enabled){let n=e.getTotalSize();r.lastSize=n;let o=e.options.horizontal?"width":"height";t.style[o]=`${n}px`}}})});return c.setOptions(s),ce(()=>c._didMount(),[]),ce(()=>(a(c),c._willUpdate())),ce(()=>{l(c)}),c}({observeElementRect:s1,observeElementOffset:s6,scrollToFn:s8,...e})}var cr=e.i(368971);(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var cn=e=>Array.isArray(e)?[...e]:(e=>{if("object"!=typeof e||null===e)return!1;let t=Object.getPrototypeOf(e);return t===Object.prototype||null===t})(e)?(0,rF.__spreadValues)({},e):{};function co(e,t,r){let n=t.split("."),o=(0,rF.__spreadValues)({},e),i=o;for(let e=0;e<n.length;e++){let[t,o]=n[e].replace("]","").split("["),a=e===n.length-1;if(void 0!==o){i[t]=Array.isArray(i[t])?[...i[t]]:[];let e=Number(o);if(a){i[t][e]=r;continue}i[t][e]=cn(i[t][e]),i=i[t][e];continue}if(a){i[t]=r;continue}i[t]=cn(i[t]),i=i[t]}return o}(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var ci=/^(data-.*)$/,ca=(0,rw.get_class_name_factory_default)("Button",{Button:"_Button_oe4qj_1","Button--medium":"_Button--medium_oe4qj_34","Button--large":"_Button--large_oe4qj_62","Button-icon":"_Button-icon_oe4qj_89","Button--primary":"_Button--primary_oe4qj_93","Button--disabled":"_Button--disabled_oe4qj_123","Button--secondary":"_Button--secondary_oe4qj_135","Button--flush":"_Button--flush_oe4qj_171","Button--fullWidth":"_Button--fullWidth_oe4qj_179","Button-spinner":"_Button-spinner_oe4qj_184"}),cl=e=>{var{children:t,href:r,onClick:n,variant:o="primary",type:i,disabled:a,tabIndex:l,newTab:s,fullWidth:c,icon:u,size:d="medium",loading:p=!1}=e,h=(0,rF.__objRest)(e,["children","href","onClick","variant","type","disabled","tabIndex","newTab","fullWidth","icon","size","loading"]);let[f,v]=(0,r_.useState)(p);(0,r_.useEffect)(()=>v(p),[p]);let g=(e=>{let t={};for(let r in e)Object.prototype.hasOwnProperty.call(e,r)&&ci.test(r)&&(t[r]=e[r]);return t})(h);return(0,rV.jsxs)(r?"a":i?"button":"span",(0,rF.__spreadProps)((0,rF.__spreadValues)({className:ca({primary:"primary"===o,secondary:"secondary"===o,disabled:a,fullWidth:c,[d]:!0}),onClick:e=>{n&&(v(!0),Promise.resolve(n(e)).then(()=>{v(!1)}))},type:i,disabled:a||f,tabIndex:l,target:s?"_blank":void 0,rel:s?"noreferrer":void 0,href:r},g),{children:[u&&(0,rV.jsx)("div",{className:ca("icon"),children:u}),t,f&&(0,rV.jsx)("div",{className:ca("spinner"),children:(0,rV.jsx)(rB.Loader,{size:14})})]}))};(0,rF.init_react_import)(),(0,rF.init_react_import)();var cs={InputWrapper:"_InputWrapper_qyenz_1","Input-label":"_Input-label_qyenz_5","Input-labelIcon":"_Input-labelIcon_qyenz_17","Input-disabledIcon":"_Input-disabledIcon_qyenz_24","Input-input":"_Input-input_qyenz_29","Input-select":"_Input-select_qyenz_61","Input-selectIcon":"_Input-selectIcon_qyenz_71",Input:"_Input_qyenz_1","Input--readOnly":"_Input--readOnly_qyenz_111","Input-radioGroupItems":"_Input-radioGroupItems_qyenz_150","Input-radio":"_Input-radio_qyenz_150","Input-radioInner":"_Input-radioInner_qyenz_179","Input-radioInput":"_Input-radioInput_qyenz_261"},cc=(0,rw.get_class_name_factory_default)("Input",cs),cu=({children:e,icon:t,label:r,el:n="label",readOnly:o,className:i})=>{let a=(0,rB.useMessage)("field-readonly");return(0,rV.jsxs)(n,{className:i,children:[(0,rV.jsxs)("div",{className:cc("label"),children:[t?(0,rV.jsx)("div",{className:cc("labelIcon"),children:t}):(0,rV.jsx)(rV.Fragment,{}),r,o&&(0,rV.jsx)("div",{className:cc("disabledIcon"),title:a,children:(0,rV.jsx)(rB.Lock,{size:"12"})})]}),e]})},cd=({children:e,icon:t,label:r,el:n="label",readOnly:o})=>{let i=(0,rB.useAppStore)(e=>e.overrides),a=(0,r_.useMemo)(()=>i.fieldLabel||cu,[i]);return r?(0,rV.jsx)(a,{label:r,icon:t,className:cc({readOnly:o}),readOnly:o,el:n,children:e}):(0,rV.jsx)(rV.Fragment,{children:e})};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var cp={ArrayField:"_ArrayField_62huh_5","ArrayField--isDraggingFrom":"_ArrayField--isDraggingFrom_62huh_30","ArrayField-addButton":"_ArrayField-addButton_62huh_38","ArrayField--hasItems":"_ArrayField--hasItems_62huh_58","ArrayField-inner":"_ArrayField-inner_62huh_93",ArrayFieldItem:"_ArrayFieldItem_62huh_101","ArrayFieldItem--isDragging":"_ArrayFieldItem--isDragging_62huh_110","ArrayFieldItem--isExpanded":"_ArrayFieldItem--isExpanded_62huh_114","ArrayFieldItem-summary":"_ArrayFieldItem-summary_62huh_132","ArrayFieldItem--noFields":"_ArrayFieldItem--noFields_62huh_167","ArrayField--addDisabled":"_ArrayField--addDisabled_62huh_176","ArrayFieldItem-body":"_ArrayFieldItem-body_62huh_228","ArrayFieldItem-fieldset":"_ArrayFieldItem-fieldset_62huh_237","ArrayFieldItem-rhs":"_ArrayFieldItem-rhs_62huh_250","ArrayFieldItem-actions":"_ArrayFieldItem-actions_62huh_256"};function ch(e,t){let r=(0,r_.useContext)(e);if(!r)throw Error("useContextStore must be used inside context");return(0,rq.useStore)(r,rW(t))}(0,rF.init_react_import)(),(0,rF.init_react_import)();var cf=(g={},{ctx:a=(0,r_.createContext)((0,rH.createStore)((0,rU.subscribeWithSelector)(()=>g))),Provider:({children:e,value:t})=>{let[r]=(0,r_.useState)(()=>(0,rH.createStore)(()=>t));return(0,rV.jsx)(a.Provider,{value:r,children:e})}}),cv=()=>(0,r_.useContext)(cf.ctx);function cg(e){let t=(0,r_.useContext)(cf.ctx);if(!t)throw Error("useContextStore must be used inside context");return(0,rq.useStore)(t,rW(e))}(0,rF.init_react_import)(),(0,rF.init_react_import)();var cm=(0,rw.get_class_name_factory_default)("DragIcon",{DragIcon:"_DragIcon_5e515_1","DragIcon--disabled":"_DragIcon--disabled_5e515_10"}),c_=({isDragDisabled:e})=>(0,rV.jsx)("div",{className:cm({disabled:e}),children:(0,rV.jsx)("svg",{viewBox:"0 0 20 20",width:"12",fill:"currentColor",children:(0,rV.jsx)("path",{d:"M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"})})});(0,rF.init_react_import)(),(0,rF.init_react_import)();var{Delay:cb,Distance:cx}=ls,cy=[new cb({value:200,tolerance:10})],ck=[new cb({value:200,tolerance:10}),new cx({value:5})],cw=({other:e=ck,mouse:t,touch:r=cy}={touch:cy,other:ck})=>{let[n]=(0,r_.useState)(()=>[lu.configure({activationConstraints(n,o){var i;let{pointerType:a,target:l}=n;return"mouse"===a&&ar(l)&&(o.handle===l||(null==(i=o.handle)?void 0:i.contains(l)))?t:"touch"===a?r:e}})]);return n};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var cS=(e,t,r,n,o)=>{},cI="increasing";(0,rF.init_react_import)();var cj=(e,t)=>{if("dynamic"===e){if(!(Math.abs(t.y)>Math.abs(t.x)))return 0===t.x?null:t.x>0?"right":"left"}else if("x"===e)return 0===t.x?null:t.x>0?"right":"left";return 0===t.y?null:t.y>0?"down":"up"};(0,rF.init_react_import)(),(0,rF.init_react_import)();var cz={current:{x:0,y:0},delta:{x:0,y:0},previous:{x:0,y:0},direction:null};(0,rF.init_react_import)();var cE=({dragOperation:e,droppable:t})=>{let r=e.position.current;if(!r)return null;let{id:n}=t;return t.shape&&t.shape.containsPoint(r)?{id:n,value:1/n8.distance(t.shape.center,r),type:oK.PointerIntersection,priority:oX.High}:null};(0,rF.init_react_import)();var cC=(0,rH.createStore)(()=>({fallbackEnabled:!1})),cA="",cP=(e,t=.05)=>r=>{var n,o,i,a,l;let{dragOperation:s,droppable:c}=r,{position:u}=s,d=null==(n=s.shape)?void 0:n.current,{shape:p}=c;if(!d||!p)return null;let{center:h}=d,{fallbackEnabled:f}=cC.getState(),v=((e,t="dynamic")=>(cz.current=e,cz.delta={x:e.x-cz.previous.x,y:e.y-cz.previous.y},cz.direction=cj(t,cz.delta)||cz.direction,(Math.abs(cz.delta.x)>10||Math.abs(cz.delta.y)>10)&&(cz.previous=n8.from(e)),cz))(u.current,e),g={direction:v.direction},{center:m}=p,_=((e,t,r,n=0)=>{let o=e.boundingRectangle,i=t.center;if("down"===r){let e=n*t.boundingRectangle.height;return o.bottom>=i.y+e}if("up"===r){let e=n*t.boundingRectangle.height;return o.top<i.y-e}if("left"===r){let e=n*t.boundingRectangle.width;return i.x-e>=o.left}let a=n*t.boundingRectangle.width;return o.right-a>=i.x})(d,p,v.direction,t);if((null==(o=s.source)?void 0:o.id)===c.id){let e=((e,t)=>{var r;let{dragOperation:n,droppable:o}=e,{shape:i}=o,{position:a}=n,l=null==(r=n.shape)?void 0:r.current;if(!l||!i)return null;let s=i.center,c=Math.sqrt(Math.pow(s.x-t.x,2)+Math.pow(s.y-t.y,2)),u=Math.sqrt(Math.pow(s.x-a.current.x,2)+Math.pow(s.y-a.current.y,2));return(cI=u===c?cI:u<c?"decreasing":"increasing",cS(l.center,s,o.id.toString(),"rebeccapurple"),"decreasing"===cI)?{id:o.id,value:1,type:oK.Collision}:null})(r,v.previous);if(cS(h,m,c.id.toString(),"yellow"),e)return(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{priority:oX.Highest,data:g})}let b=d.intersectionArea(p),y=b/p.area;if(b&&_){cS(h,m,c.id.toString(),"green",v.direction);let e={id:c.id,value:y,priority:oX.High,type:oK.Collision},t=cA===c.id;return cA="",(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{id:t?"flush":e.id,data:g})}if(f&&(null==(i=s.source)?void 0:i.id)!==c.id){let t=p.boundingRectangle.right>d.boundingRectangle.left&&p.boundingRectangle.left<d.boundingRectangle.right,n=p.boundingRectangle.bottom>d.boundingRectangle.top&&p.boundingRectangle.top<d.boundingRectangle.bottom;if("y"===e&&t||n){let t=(e=>{let{dragOperation:t,droppable:r}=e,{shape:n,position:o}=t;if(!r.shape)return null;let i=n?n9.from(n.current.boundingRectangle).corners:void 0,a=n9.from(r.shape.boundingRectangle).corners.reduce((e,t,r)=>{var n;return e+n8.distance(n8.from(t),null!=(n=null==i?void 0:i[r])?n:o.current)},0);return{id:r.id,value:1/(a/4),type:oK.Collision,priority:oX.Normal}})(r);if(t){let r=cj(e,{x:d.center.x-((null==(a=c.shape)?void 0:a.center.x)||0),y:d.center.y-((null==(l=c.shape)?void 0:l.center.y)||0)});return(g.direction=r,b)?(cS(h,m,c.id.toString(),"red",r||""),cA=c.id,(0,rF.__spreadProps)((0,rF.__spreadValues)({},t),{priority:oX.Low,data:g})):(cS(h,m,c.id.toString(),"orange",r||""),(0,rF.__spreadProps)((0,rF.__spreadValues)({},t),{priority:oX.Lowest,data:g}))}}}return cS(h,m,c.id.toString(),"hotpink"),null};(0,rF.init_react_import)();var cM=(e,t="ltr")=>"up"===e||"ltr"===t&&"left"===e||"rtl"===t&&"right"===e?"before":"after",cO=({position:e,sourceIndex:t,targetIndex:r,isSameZone:n})=>{let o=r;return n&&o>=t&&(o-=1),"after"===e&&(o+=1),o},cD=({children:e,onDragStart:t,onDragEnd:r,onMove:n})=>{let o=cw({mouse:[new ls.Distance({value:5})]});return(0,rV.jsx)(lF,{sensors:o,onDragStart:e=>{var r,n;return t(null!=(n=null==(r=e.operation.source)?void 0:r.id.toString())?n:"")},onDragOver:(e,t)=>{var r;e.preventDefault();let{operation:o}=e,{source:i,target:a}=o;if(!i||!a)return;let l=i.data.index,s=a.data.index,c=null==(r=t.collisionObserver.collisions[0])?void 0:r.data;l!==s&&i.id!==a.id&&n({source:l,target:cO({position:cM(null==c?void 0:c.direction),sourceIndex:l,targetIndex:s,isSameZone:!0})})},onDragEnd:()=>{setTimeout(()=>{r()},250)},children:e})},cT=({id:e,index:t,disabled:r,children:n,type:o="item"})=>{let{ref:i,isDragging:a,isDropping:l,handleRef:s}=sq({id:e,type:o,index:t,disabled:r,data:{index:t},collisionDetector:cP("y")});return n({isDragging:a,isDropping:l,ref:i,handleRef:s})};(0,rF.init_react_import)();var cN=(0,r_.createContext)({}),cL=()=>{let e=(0,r_.useContext)(cN);return(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{readOnlyFields:e.readOnlyFields||{}})},cB=({children:e,name:t,subName:r,wildcardName:n=t,readOnlyFields:o})=>{let i=`${t}.${r}`,a=`${n}.${r}`,l=(0,r_.useMemo)(()=>Object.keys(o).reduce((e,r)=>{if(r.indexOf(i)>-1||r.indexOf(a)>-1){let i=new RegExp(`^(${t}|${n}).`.replace(/\[/g,"\\[").replace(/\]/g,"\\]").replace(/\./g,"\\.").replace(/\*/g,"\\*")),a=r.replace(i,"");return(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{[a]:o[r]})}return e},{}),[t,r,n,o]);return(0,rV.jsx)(cN.Provider,{value:{readOnlyFields:l,localName:r},children:e})};(0,rF.init_react_import)();var cR=(e,t)=>t.split(".").reduce((e,t)=>{if(!e)return;let[r,n]=t.replace("]","").split("["),o=e[r];return n&&o?o[parseInt(n)]:o},e);(0,rF.init_react_import)();var cF=(0,r_.memo)(({field:e,id:t,index:r,name:n,subName:o,localName:i,onChange:a,forceReadOnly:l})=>{let s=void 0!==r?`${n}[${r}]`:n,c=n?`${s}.${o}`:o,u=void 0!==r?`${i}[${r}]`:null!=i?i:o,d=void 0!==r?`${i}[*]`:i,p=`${u}.${o}`,h=`${d}.${o}`,{readOnlyFields:f}=cL(),v=l||(void 0!==f[c]?f[p]:f[h]),g=e.label||o;return(0,rV.jsx)(cB,{name:u,wildcardName:d,subName:o,readOnlyFields:f,children:(0,rV.jsx)(ua,{name:c,label:g,id:t,readOnly:v,field:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{label:g}),onChange:(e,t)=>{a(e,t,o)}})})}),cV=(0,rw.get_class_name_factory_default)("ArrayField",cp),c$=(0,rw.get_class_name_factory_default)("ArrayFieldItem",cp),cW=(0,r_.memo)(({index:e,originalIndex:t,field:r,name:n})=>{let o=cg(t=>cR(t,`${[n]}[${e}]`)),i=(0,rB.useMessage)("field-arrayitem-summary",{index:t});return(0,r_.useMemo)(()=>o&&r.getItemSummary?r.getItemSummary(o,e):i,[o,r,t,e,i])}),cH=(0,r_.memo)(({id:e,arrayId:t,index:r,dragIndex:n,originalIndex:o,field:i,onChange:a,onToggleExpand:l,readOnly:s,actions:c,name:u,localName:d})=>{let p=(0,rB.useAppStore)(r=>{var n;return(null==(n=r.state.ui.arrayState[t])?void 0:n.openId)===e}),h=(0,rB.useAppStore)(e=>e.permissions.getPermissions({item:e.selectedItem}).edit),f=(0,r_.useMemo)(()=>!!i.arrayFields&&Object.values(i.arrayFields).some(e=>"slot"!==e.type&&!1!==e.visible),[i.arrayFields]);return(0,rV.jsx)(cT,{id:e,index:n,disabled:s,children:({isDragging:t,ref:n,handleRef:v})=>(0,rV.jsxs)("div",{ref:n,className:c$({isExpanded:p&&f,isDragging:t,noFields:!f}),children:[(0,rV.jsxs)("div",{ref:v,onClick:r=>{t||(r.preventDefault(),r.stopPropagation(),f&&l(e,p))},className:c$("summary"),children:[(0,rV.jsx)(cW,{index:r,originalIndex:o,field:i,name:u}),(0,rV.jsxs)("div",{className:c$("rhs"),children:[!s&&(0,rV.jsx)("div",{className:c$("actions"),children:c}),(0,rV.jsx)("div",{children:(0,rV.jsx)(c_,{})})]})]}),(0,rV.jsx)("div",{className:c$("body"),children:p&&f&&(0,rV.jsx)("fieldset",{className:c$("fieldset"),children:Object.keys(i.arrayFields).map(t=>{let n=i.arrayFields[t];return(0,rV.jsx)(cF,{id:`${e}_${t}`,name:u,index:r,subName:t,localName:d,field:n,onChange:a,forceReadOnly:!h},`${e}_${t}_${r}`)})})})]})})});(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var cq=(e,t=!0)=>cg(r=>t?cR(r,e):void 0);(0,rF.init_react_import)();var cU=(e,t,{tracked:r=!0,fallback:n}={})=>{let o=cq(e,r),i=(0,rB.useAppStore)(t=>t.state.ui.field.focus===e),[a,l]=(0,r_.useState)(o),s=(0,r_.useCallback)((e,...r)=>{l(e),t(e,...r)},[t]);return((0,r_.useEffect)(()=>{r&&(i||l(o))},[r,i,o]),r)?[void 0!==n&&null==a?n:a,s]:[void 0,t]},cZ=(0,rw.get_class_name_factory_default)("Input",cs),cY=({field:e,onChange:t,readOnly:r,id:n,name:o=n,label:i,labelIcon:a,Label:l})=>{let[s,c]=cU(o,t,{fallback:""});return(0,rV.jsx)(l,{label:i||o,icon:a||(0,rV.jsxs)(rV.Fragment,{children:["text"===e.type&&(0,rV.jsx)(rB.Type,{size:16}),"number"===e.type&&(0,rV.jsx)(rB.Hash,{size:16})]}),readOnly:r,children:(0,rV.jsx)("input",{className:cZ("input"),autoComplete:"off",type:e.type,title:i||o,name:o,value:s,onChange:t=>{if("number"===e.type){let r=Number(t.currentTarget.value);(void 0===e.min||!(r<e.min))&&(void 0!==e.max&&r>e.max||c(r))}else c(t.currentTarget.value)},readOnly:r,tabIndex:r?-1:void 0,id:n,min:"number"===e.type?e.min:void 0,max:"number"===e.type?e.max:void 0,placeholder:"text"===e.type||"number"===e.type?e.placeholder:void 0,step:"number"===e.type?e.step:void 0})})};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var cX={"ExternalInput-actions":"_ExternalInput-actions_143vl_1","ExternalInput-button":"_ExternalInput-button_143vl_5","ExternalInput--dataSelected":"_ExternalInput--dataSelected_143vl_34","ExternalInput--readOnly":"_ExternalInput--readOnly_143vl_41","ExternalInput-detachButton":"_ExternalInput-detachButton_143vl_48",ExternalInput:"_ExternalInput_143vl_1",ExternalInputModal:"_ExternalInputModal_143vl_118","ExternalInputModal-grid":"_ExternalInputModal-grid_143vl_128","ExternalInputModal--filtersToggled":"_ExternalInputModal--filtersToggled_143vl_139","ExternalInputModal-filters":"_ExternalInputModal-filters_143vl_144","ExternalInputModal-masthead":"_ExternalInputModal-masthead_143vl_164","ExternalInputModal-tableWrapper":"_ExternalInputModal-tableWrapper_143vl_173","ExternalInputModal-table":"_ExternalInputModal-table_143vl_173","ExternalInputModal-thead":"_ExternalInputModal-thead_143vl_189","ExternalInputModal-th":"_ExternalInputModal-th_143vl_189","ExternalInputModal-td":"_ExternalInputModal-td_143vl_204","ExternalInputModal-tr":"_ExternalInputModal-tr_143vl_210","ExternalInputModal-tbody":"_ExternalInputModal-tbody_143vl_217","ExternalInputModal--hasData":"_ExternalInputModal--hasData_143vl_244","ExternalInputModal-loadingBanner":"_ExternalInputModal-loadingBanner_143vl_248","ExternalInputModal--isLoading":"_ExternalInputModal--isLoading_143vl_265","ExternalInputModal-searchForm":"_ExternalInputModal-searchForm_143vl_269","ExternalInputModal-search":"_ExternalInputModal-search_143vl_269","ExternalInputModal-searchIcon":"_ExternalInputModal-searchIcon_143vl_306","ExternalInputModal-searchIconText":"_ExternalInputModal-searchIconText_143vl_333","ExternalInputModal-searchInput":"_ExternalInputModal-searchInput_143vl_343","ExternalInputModal-searchActions":"_ExternalInputModal-searchActions_143vl_358","ExternalInputModal-searchActionIcon":"_ExternalInputModal-searchActionIcon_143vl_371","ExternalInputModal-footerContainer":"_ExternalInputModal-footerContainer_143vl_375","ExternalInputModal-footer":"_ExternalInputModal-footer_143vl_375","ExternalInputModal-field":"_ExternalInputModal-field_143vl_388"};(0,rF.init_react_import)(),(0,rF.init_react_import)();var cK=(0,rw.get_class_name_factory_default)("Modal",{Modal:"_Modal_g5xob_1","Modal--isOpen":"_Modal--isOpen_g5xob_15","Modal-inner":"_Modal-inner_g5xob_19"}),cJ=({children:e,onClose:t,isOpen:r})=>{let[n,o]=(0,r_.useState)(null);return((0,r_.useEffect)(()=>{o(document.getElementById("puck-portal-root"))},[]),n)?(0,lx.createPortal)((0,rV.jsx)("div",{className:cK({isOpen:r}),onClick:t,children:(0,rV.jsx)("div",{className:cK("inner"),onClick:e=>e.stopPropagation(),children:e})}),n):(0,rV.jsx)("div",{})};(0,rF.init_react_import)(),(0,rF.init_react_import)();var cG=(0,rw.get_class_name_factory_default)("Heading",{Heading:"_Heading_97eh4_1","Heading--xxxxl":"_Heading--xxxxl_97eh4_12","Heading--xxxl":"_Heading--xxxl_97eh4_18","Heading--xxl":"_Heading--xxl_97eh4_22","Heading--xl":"_Heading--xl_97eh4_26","Heading--l":"_Heading--l_97eh4_30","Heading--m":"_Heading--m_97eh4_34","Heading--s":"_Heading--s_97eh4_38","Heading--xs":"_Heading--xs_97eh4_42"}),cQ=({children:e,rank:t,size:r="m"})=>{let n=t?`h${t}`:"span";return(0,rV.jsx)(n,{className:cG({[r]:!0}),children:e})};(0,rF.init_react_import)();var c0=(0,rw.get_class_name_factory_default)("ExternalInput",cX),c1=(0,rw.get_class_name_factory_default)("ExternalInputModal",cX),c2=({count:e})=>{let t=(0,rB.useMessage)("field-external-result-singular",{count:e}),r=(0,rB.useMessage)("field-external-result-plural",{count:e});return(0,rV.jsx)("span",{className:c1("footer"),children:1===e?t:r})},c4={},c3=({field:e,onChange:t,value:r=null,name:n,id:o,readOnly:i})=>{var a;let{mapProp:l=e=>e,mapRow:s=e=>e,filterFields:c}=e||{},{enabled:u}=null!=(a=e.cache)?a:{enabled:!0},[d,p]=(0,r_.useState)([]),[h,f]=(0,r_.useState)(!1),[v,g]=(0,r_.useState)(!0),m=!!c,[_,b]=(0,r_.useState)(e.initialFilters||{}),[y,k]=(0,r_.useState)(m),w=(0,r_.useMemo)(()=>d.map(s),[d]),S=(0,r_.useMemo)(()=>{let e=new Set;for(let t of w)for(let r of Object.keys(t))("string"==typeof t[r]||"number"==typeof t[r]||(0,r_.isValidElement)(t[r]))&&e.add(r);return Array.from(e)},[w]),[I,j]=(0,r_.useState)(e.initialQuery||""),z=(0,r_.useCallback)((t,r)=>(0,rF.__async)(null,null,function*(){let n;g(!0);let i=`${o}-${t}-${JSON.stringify(r)}`;(n=u&&c4[i]?c4[i]:yield e.fetchList({query:t,filters:r}))&&(p(n),g(!1),u&&(c4[i]=n))}),[o,e]),E=(0,r_.useCallback)(t=>e.renderFooter?e.renderFooter(t):(0,rV.jsx)(c2,{count:t.items.length}),[e.renderFooter]);(0,r_.useEffect)(()=>{z(I,_)},[]);let C=(0,rB.useMessage)("field-external-item"),A=(0,rB.useMessage)("field-external-search"),P=(0,rB.useMessage)("field-external-togglefilters"),M=(0,rB.useMessage)("field-external-selectdata");return(0,rV.jsxs)("div",{className:c0({dataSelected:!!r,modalVisible:h,readOnly:i}),id:o,children:[(0,rV.jsxs)("div",{className:c0("actions"),children:[(0,rV.jsx)("button",{type:"button",onClick:()=>f(!0),className:c0("button"),disabled:i,children:r?e.getItemSummary?e.getItemSummary(r):C:(0,rV.jsxs)(rV.Fragment,{children:[(0,rV.jsx)(rB.Link,{size:"16"}),(0,rV.jsx)("span",{children:e.placeholder})]})}),r&&(0,rV.jsx)("button",{type:"button",className:c0("detachButton"),onClick:()=>{t(null)},disabled:i,children:(0,rV.jsx)(rB.LockOpen,{size:16})})]}),(0,rV.jsx)(cJ,{onClose:()=>f(!1),isOpen:h,children:(0,rV.jsxs)("form",{className:c1({isLoading:v,loaded:!v,hasData:w.length>0,filtersToggled:y}),onSubmit:e=>{e.preventDefault(),e.stopPropagation(),z(I,_)},children:[(0,rV.jsx)("div",{className:c1("masthead"),children:e.showSearch?(0,rV.jsxs)("div",{className:c1("searchForm"),children:[(0,rV.jsxs)("label",{className:c1("search"),children:[(0,rV.jsx)("span",{className:c1("searchIconText"),children:A}),(0,rV.jsx)("div",{className:c1("searchIcon"),children:(0,rV.jsx)(rB.Search,{size:"18"})}),(0,rV.jsx)("input",{className:c1("searchInput"),name:"q",type:"search",placeholder:e.placeholder,onChange:e=>{j(e.currentTarget.value)},autoComplete:"off",value:I})]}),(0,rV.jsxs)("div",{className:c1("searchActions"),children:[(0,rV.jsx)(cl,{type:"submit",loading:v,fullWidth:!0,children:A}),m&&(0,rV.jsx)("div",{className:c1("searchActionIcon"),children:(0,rV.jsx)(rB.IconButton,{type:"button",title:P,onClick:e=>{e.preventDefault(),e.stopPropagation(),k(!y)},children:(0,rV.jsx)(rB.SlidersHorizontal,{size:20})})})]})]}):(0,rV.jsx)(cQ,{rank:"2",size:"xs",children:e.placeholder||M})}),(0,rV.jsxs)("div",{className:c1("grid"),children:[m&&(0,rV.jsx)("div",{className:c1("filters"),children:m&&Object.keys(c).map(e=>{let t=c[e];return(0,rV.jsx)("div",{className:c1("field"),children:(0,rV.jsx)(cu,{label:t.label||e,children:(0,rV.jsx)(us,{field:t,id:`external_field_${e}_filter`,value:_[e],onChange:t=>{b(r=>{let n=(0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{[e]:t});return z(I,n),n})}})})},e)})}),(0,rV.jsxs)("div",{className:c1("tableWrapper"),children:[(0,rV.jsxs)("table",{className:c1("table"),children:[(0,rV.jsx)("thead",{className:c1("thead"),children:(0,rV.jsx)("tr",{className:c1("tr"),children:S.map(e=>(0,rV.jsx)("th",{className:c1("th"),style:{textAlign:"left"},children:e},e))})}),(0,rV.jsx)("tbody",{className:c1("tbody"),children:w.map((e,r)=>(0,rV.jsx)("tr",{style:{whiteSpace:"nowrap"},className:c1("tr"),onClick:()=>{t(l(d[r])),f(!1)},children:S.map(t=>(0,rV.jsx)("td",{className:c1("td"),children:e[t]},t))},r))})]}),(0,rV.jsx)("div",{className:c1("loadingBanner"),children:(0,rV.jsx)(rB.Loader,{size:24})})]})]}),(0,rV.jsx)("div",{className:c1("footerContainer"),children:(0,rV.jsx)(E,{items:w})})]})})]})};(0,rF.init_react_import)();var c6=(0,rw.get_class_name_factory_default)("Input",cs);(0,rF.init_react_import)();var c5=(0,rw.get_class_name_factory_default)("Input",cs);(0,rF.init_react_import)();var c8=(0,rw.get_class_name_factory_default)("Input",cs);(0,rF.init_react_import)(),(0,rF.init_react_import)();var c9=(0,r_.memo)(e=>{var t;return(0,rV.jsx)(rx.EditorInner,(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{editor:null,menu:(0,rV.jsx)(rL.LoadedRichTextMenuInner,{field:e.field,editor:null,editorState:null,readOnly:null!=(t=e.readOnly)&&t}),children:(0,rV.jsx)("div",{className:"rich-text",dangerouslySetInnerHTML:{__html:e.content},contentEditable:!0})}))});c9.displayName="EditorFallback";var c7=(0,r_.lazy)(()=>e.A(167900).then(e=>({default:e.Editor})));(0,rF.init_react_import)(),(0,rF.init_react_import)();var ue=(0,rw.get_class_name_factory_default)("ObjectField",{ObjectField:"_ObjectField_c5reb_1","ObjectField-fieldset":"_ObjectField-fieldset_c5reb_10"});(0,rF.init_react_import)();var ut=()=>{if(void 0!==r_.default.useId)return r_.default.useId();let[e]=(0,r_.useState)((0,rR.generateId)());return e},ur=(0,rw.get_class_name_factory_default)("Input",cs),un=(0,rw.get_class_name_factory_default)("InputWrapper",cs),uo={array:({field:e,onChange:t,id:r,name:n=r,label:o,labelIcon:i,readOnly:a,Label:l=e=>(0,rV.jsx)("div",(0,rF.__spreadValues)({},e))})=>{let s=(0,rB.useAppStore)(e=>e.setUi),c=(0,rB.useAppStoreApi)(),u=cv(),{localName:d=n}=cL(),p=()=>{var e;return null!=(e=cR(u.getState(),n))?e:[]},h=(0,r_.useCallback)(()=>{var e;let{state:t}=c.getState(),n=t.ui.arrayState[r];return(null==(e=null==n?void 0:n.items)?void 0:e.length)?n:{items:Array.from(p()||[]).map((e,t)=>({_originalIndex:t,_currentIndex:t,_arrayId:`${r}-${t}`})),openId:""}},[c,r,p,n]),f=cg(()=>p().length),v=(0,r_.useMemo)(h,[h]),g=(0,rB.useAppStore)(e=>{let t=e.state.ui.arrayState[r];return null!=t?t:v}),m=(0,rB.useAppStoreApi)(),_=(0,r_.useCallback)(e=>{let t=m.getState().state;return{arrayState:(0,rF.__spreadProps)((0,rF.__spreadValues)({},t.ui.arrayState),{[r]:(0,rF.__spreadValues)((0,rF.__spreadValues)({},h()),e)})}},[m]),b=(0,r_.useCallback)(()=>h().items.reduce((e,t)=>t._originalIndex>e?t._originalIndex:e,-1),[]),y=(0,r_.useCallback)(e=>{let t=b(),n=h(),o=Array.from(e||[]).map((e,o)=>{var i,a,l;let s=n.items[o],c={_originalIndex:null!=(i=null==s?void 0:s._originalIndex)?i:t+1,_currentIndex:null!=(a=null==s?void 0:s._currentIndex)?a:o,_arrayId:(null==(l=n.items[o])?void 0:l._arrayId)||`${r}-${t+1}`};return c._originalIndex>t&&(t=c._originalIndex),c});return(0,rF.__spreadProps)((0,rF.__spreadValues)({},n),{items:o})},[]),[k,w]=(0,r_.useState)(""),S=!!k,I=(0,r_.useRef)([]);(0,r_.useEffect)(()=>{I.current=p()},[]);let j=(0,r_.useCallback)(t=>{if("array"!==e.type||!e.arrayFields)return;let r=m.getState().config;return(0,rS.walkField)({value:t,fields:e.arrayFields,mappers:{slot:({value:e})=>e.map(e=>(0,rR.populateIds)(e,r,!0))},config:r})},[m,e]),z=(0,r_.useCallback)(()=>{let e=h(),t=e.items.map((e,t)=>(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{_currentIndex:t})),n=m.getState().state;s({arrayState:(0,rF.__spreadProps)((0,rF.__spreadValues)({},n.ui.arrayState),{[r]:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{items:t})})},!1)},[]),E=(0,r_.useCallback)(e=>{s(_(y(e)),!1),t(e)},[y,s,_,t]);(0,r_.useEffect)(()=>{s(_(y(p())),!1)},[f]);let C=(0,rB.useMessage)("field-arrayitem-duplicate"),A=(0,rB.useMessage)("field-arrayitem-delete");if("array"!==e.type||!e.arrayFields)return null;let P=void 0!==e.max&&(null==g?void 0:g.items.length)>=e.max||a;return(0,rV.jsx)(l,{label:o||n,icon:i||(0,rV.jsx)(rB.List,{size:16}),el:"div",readOnly:a,children:(0,rV.jsx)(cD,{onDragStart:e=>{I.current=p(),w(e),z()},onDragEnd:()=>{w(""),t(I.current);let e=u.getState();u.setState(co(e,n,I.current)),z()},onMove:e=>{let t=h();if(t.items[e.source]._arrayId!==k)return;let n=(0,rB.reorder)(I.current,e.source,e.target),o=(0,rB.reorder)(t.items,e.source,e.target),i=m.getState().state;s({arrayState:(0,rF.__spreadProps)((0,rF.__spreadValues)({},i.ui.arrayState),{[r]:(0,rF.__spreadProps)((0,rF.__spreadValues)({},t),{items:o})})},!1),I.current=n},children:(0,rV.jsxs)("div",{className:cV({hasItems:f>0,addDisabled:P}),children:[g.items.length>0&&(0,rV.jsx)("div",{className:cV("inner"),"data-dnd-container":!0,children:g.items.map((o,i)=>{let{_arrayId:l=`${r}-${i}`,_originalIndex:c=i,_currentIndex:u=i}=o;return(0,rV.jsx)(cH,{index:u,dragIndex:i,originalIndex:c,arrayId:r,id:l,readOnly:a,field:e,name:n,localName:d,onChange:(e,r,n)=>{let o=p(),a=Array.from(o||[])[i]||{};t((0,rB.replace)(o,i,(0,rF.__spreadProps)((0,rF.__spreadValues)({},a),{[n]:e})),r)},onToggleExpand:(e,t)=>{t?s(_({openId:""})):s(_({openId:e}))},actions:(0,rV.jsxs)(rV.Fragment,{children:[(0,rV.jsx)("div",{className:c$("action"),children:(0,rV.jsx)(rB.IconButton,{type:"button",disabled:!!P,onClick:e=>{e.stopPropagation();let t=[...p()||[]],r=j(t[i]);t.splice(i,0,r),E(t)},title:C,children:(0,rV.jsx)(rB.Copy,{size:16})})}),(0,rV.jsx)("div",{className:c$("action"),children:(0,rV.jsx)(rB.IconButton,{type:"button",disabled:void 0!==e.min&&e.min>=g.items.length,onClick:e=>{e.stopPropagation();let t=[...p()||[]];t.splice(i,1),E(t)},title:A,children:(0,rV.jsx)(rB.Trash,{size:16})})})]})},l)})}),!P&&(0,rV.jsx)("button",{type:"button",className:cV("addButton"),onClick:()=>{var t;if(S)return;let r=p()||[],n="function"==typeof e.defaultItemProps?e.defaultItemProps(r.length):null!=(t=e.defaultItemProps)?t:{};E([...r,(0,rS.defaultSlots)(j(n),e.arrayFields)])},children:(0,rV.jsx)(rB.Plus,{size:21})})]})})})},external:({field:e,onChange:t,id:r,name:n=r,label:o,labelIcon:i,Label:a,readOnly:l})=>{var s,c,u;let d=cq(n),p=(0,rB.useMessage)("field-external-selectdata");return((0,r_.useEffect)(()=>{e.adaptor&&console.error("Warning: The `adaptor` API is deprecated. Please use updated APIs on the `external` field instead. This will be a breaking change in a future release.")},[]),"external"!==e.type)?null:(0,rV.jsx)(a,{label:o||n,icon:i||(0,rV.jsx)(rB.Link,{size:16}),el:"div",children:(0,rV.jsx)(c3,{name:n,field:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{placeholder:(null==(s=e.adaptor)?void 0:s.name)?`Select from ${e.adaptor.name}`:e.placeholder||p,mapProp:(null==(c=e.adaptor)?void 0:c.mapProp)||e.mapProp,mapRow:e.mapRow,fetchList:(null==(u=e.adaptor)?void 0:u.fetchList)?()=>(0,rF.__async)(null,null,function*(){return yield e.adaptor.fetchList(e.adaptorParams)}):e.fetchList}),onChange:t,value:d,id:r,readOnly:l})})},object:({field:e,onChange:t,id:r,name:n=r,label:o,labelIcon:i,Label:a,readOnly:l})=>{let{localName:s=n}=cL(),c=cv(),u=(0,rB.useAppStore)(e=>e.permissions.getPermissions({item:e.selectedItem}).edit);return"object"===e.type&&e.objectFields?(0,rV.jsx)(a,{label:o||n,icon:i||(0,rV.jsx)(rB.EllipsisVertical,{size:16}),el:"div",readOnly:l,children:(0,rV.jsx)("div",{className:ue(),children:(0,rV.jsx)("fieldset",{className:ue("fieldset"),children:Object.keys(e.objectFields).map(o=>{let i=e.objectFields[o],a=`${s}.${o}`;return(0,rV.jsx)(cF,{id:`${r}_${o}`,name:n,subName:o,localName:s,field:i,forceReadOnly:!u,onChange:(e,r,o)=>{var i;let a=null!=(i=cR(c.getState(),n))?i:{};a[o]!==e&&t((0,rF.__spreadProps)((0,rF.__spreadValues)({},a),{[o]:e}),r)}},a)})})})}):null},select:({field:e,onChange:t,label:r,labelIcon:n,Label:o,id:i,name:a=i,readOnly:l})=>{let s=cq(a);return"select"===e.type&&e.options?(0,rV.jsx)(o,{label:r||a,icon:n||(0,rV.jsx)(rB.ChevronDown,{size:16}),readOnly:l,children:(0,rV.jsxs)("div",{className:c5("select"),children:[(0,rV.jsx)("select",{id:i,title:r||a,className:c5("input"),disabled:l,onChange:e=>{t(JSON.parse(e.target.value).value)},value:JSON.stringify({value:s}),children:e.options.map(e=>(0,rV.jsx)("option",{label:e.label,value:JSON.stringify({value:e.value})},e.label+JSON.stringify(e.value)))}),(0,rV.jsx)(rB.ChevronDown,{size:18,className:c5("selectIcon")})]})}):null},textarea:({field:e,onChange:t,readOnly:r,id:n,name:o=n,label:i,labelIcon:a,Label:l})=>{let[s,c]=cU(o,t,{fallback:""});return(0,rV.jsx)(l,{label:i||o,icon:a||(0,rV.jsx)(rB.Type,{size:16}),readOnly:r,children:(0,rV.jsx)("textarea",{id:n,className:c8("input"),autoComplete:"off",name:o,value:s,onChange:e=>c(e.currentTarget.value),readOnly:r,tabIndex:r?-1:void 0,rows:5,placeholder:"textarea"===e.type?e.placeholder:void 0})})},radio:({field:e,onChange:t,readOnly:r,id:n,name:o=n,label:i,labelIcon:a,Label:l})=>{let s=cq(o);return"radio"===e.type&&e.options?(0,rV.jsx)(l,{icon:a||(0,rV.jsx)(rB.CircleCheckBig,{size:16}),label:i||o,readOnly:r,el:"div",children:(0,rV.jsx)("div",{className:c6("radioGroupItems"),id:n,children:e.options.map(e=>{var n;return(0,rV.jsxs)("label",{className:c6("radio"),children:[(0,rV.jsx)("input",{type:"radio",className:c6("radioInput"),value:JSON.stringify({value:e.value}),name:o,onChange:e=>{t(JSON.parse(e.target.value).value)},disabled:r,checked:s===e.value}),(0,rV.jsx)("div",{className:c6("radioInner"),children:e.label||(null==(n=e.value)?void 0:n.toString())})]},e.label+e.value)})})}):null},text:cY,number:cY,richtext:({onChange:e,readOnly:t=!1,id:r,name:n=r,label:o,labelIcon:i,Label:a,field:l})=>{let s={onChange:e,content:cq(n),readOnly:t,field:l,id:r,name:n};return(0,rV.jsx)(rV.Fragment,{children:(0,rV.jsx)(a,{label:o||n,icon:i||(0,rV.jsx)(rB.Type,{size:16}),readOnly:t,el:"div",children:(0,rV.jsx)(r_.Suspense,{fallback:(0,rV.jsx)(c9,(0,rF.__spreadValues)({},s)),children:(0,rV.jsx)(c7,(0,rF.__spreadValues)({},s))})})})}};function ui(e){var t,r,n;let o=(0,rB.useAppStore)(e=>e.dispatch),i=(0,rB.useAppStore)(e=>e.overrides),a=(0,rB.useAppStore)(rW(e=>{var t;return null==(t=e.selectedItem)?void 0:t.readOnly})),l=(0,r_.useContext)(cN),{id:s,Label:c=cd}=e,u=e.field,d=u.label,p=u.labelIcon,h=ut(),f=s||h,v=(0,r_.useMemo)(()=>{var e,t,r,n,o,a,l,s,c,u;return(0,rF.__spreadProps)((0,rF.__spreadValues)({},i.fieldTypes),{custom:null==(e=i.fieldTypes)?void 0:e.custom,array:(null==(t=i.fieldTypes)?void 0:t.array)||uo.array,external:(null==(r=i.fieldTypes)?void 0:r.external)||uo.external,object:(null==(n=i.fieldTypes)?void 0:n.object)||uo.object,select:(null==(o=i.fieldTypes)?void 0:o.select)||uo.select,textarea:(null==(a=i.fieldTypes)?void 0:a.textarea)||uo.textarea,radio:(null==(l=i.fieldTypes)?void 0:l.radio)||uo.radio,text:(null==(s=i.fieldTypes)?void 0:s.text)||uo.text,number:(null==(c=i.fieldTypes)?void 0:c.number)||uo.number,richtext:(null==(u=i.fieldTypes)?void 0:u.richtext)||uo.richtext})},[i]),g="custom"===u.type||!!(null==(t=i.fieldTypes)?void 0:t[u.type]),m=null!=(r=e.name)?r:f,_=cv(),b=(0,r_.useMemo)(()=>g?(t,r)=>{var n;null==(n=e.onChange)||n.call(e,t,r),_.setState(co(_.getState(),m,t))}:e.onChange,[g,e.onChange,m,_]),[y,k]=cU(m,b,{tracked:g}),w=(0,r_.useMemo)(()=>(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{field:u,label:d,labelIcon:p,Label:c,id:f,value:y,onChange:k}),[e,u,d,p,c,f,y,k]),S=(0,r_.useCallback)(e=>{w.name&&("INPUT"===e.target.nodeName||"TEXTAREA"===e.target.nodeName)&&(e.stopPropagation(),o({type:"setUi",ui:{field:{focus:w.name}}}))},[w.name]),I=(0,r_.useCallback)(e=>{"name"in e.target&&o({type:"setUi",ui:{field:{focus:null}}})},[]),j=(0,r_.useMemo)(()=>"custom"!==u.type&&"slot"!==u.type?uo[u.type]:e=>null,[u.type]),z="custom"===u.type?u.key:void 0,E=(0,r_.useMemo)(()=>"custom"!==u.type||v[u.type]?"slot"!==u.type?v[u.type]:void 0:u.render?u.render:null,[u.type,z,v]),{visible:C=!0}=e.field;if(!C||"slot"===u.type)return null;if(!E)throw Error(`Field type for ${u.type} did not exist.`);return(0,rV.jsx)(cN.Provider,{value:{readOnlyFields:l.readOnlyFields||a||{},localName:null!=(n=l.localName)?n:w.name},children:(0,rV.jsx)("div",{className:un(),onFocus:S,onBlur:I,onClick:e=>{e.stopPropagation()},children:(0,rV.jsx)(E,(0,rF.__spreadProps)((0,rF.__spreadValues)({},w),{children:(0,rV.jsx)(j,(0,rF.__spreadValues)({},w))}))})})}function ua(e){return(0,rV.jsx)(ui,(0,rF.__spreadValues)({},e))}function ul(e){var{value:t}=e,r=(0,rF.__objRest)(e,["value"]);let n=(0,r_.useMemo)(()=>e=>(0,rV.jsx)("div",(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{className:ur({readOnly:r.readOnly})})),[r.readOnly]),o=cv(),i=(0,r_.useCallback)(e=>{r.id&&(o.setState({[r.id]:e}),r.onChange(e))},[o,r.onChange,r.id]);return(0,r_.useEffect)(()=>{r.id&&o.setState({[r.id]:t})},[r.id,t,o]),(0,rV.jsx)(ui,(0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{onChange:i,Label:n}))}function us(e){let t=ut();return"slot"===e.field.type?null:(0,rV.jsx)(cf.Provider,{value:{[t]:e.value},children:(0,rV.jsx)(ul,(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{id:t}))})}function uc(e){let t={x:0,y:0},r=e;for(;r&&r!==document.documentElement;){let e=r.parentElement;e&&(t.x+=e.scrollLeft,t.y+=e.scrollTop),r=e}return t}(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var uu=(0,r_.createContext)(null),ud=(0,r_.createContext)((0,rH.createStore)(()=>({zoneDepthIndex:{},nextZoneDepthIndex:{},areaDepthIndex:{},nextAreaDepthIndex:{},draggedItem:null,previewIndex:{},enabledIndex:{},hoveringComponent:null,registerRootVirtualizer:()=>{},unregisterRootVirtualizer:()=>{},scrollToComponent:()=>!1}))),up=({children:e,store:t})=>(0,rV.jsx)(ud.Provider,{value:t,children:e}),uh=({children:e,value:t})=>{let r=(0,rB.useAppStore)(e=>e.dispatch),n=(0,r_.useCallback)(e=>{r({type:"registerZone",zone:e})},[r]),o=(0,r_.useMemo)(()=>(0,rF.__spreadValues)({registerZone:n},t),[t]);return(0,rV.jsx)(rV.Fragment,{children:o&&(0,rV.jsx)(uu.Provider,{value:o,children:e})})};(0,rF.init_react_import)();var uf=(e,t=[])=>{let r=(0,rB.useAppStoreApi)();return(0,r_.useCallback)(()=>{let t=()=>{},n=r=>{r?e(!1):(setTimeout(()=>{e(!0)},0),t&&t())},o=r.getState().state.ui.isDragging;return n(o),o&&(t=r.subscribe(e=>e.state.ui.isDragging,e=>{n(e)})),t},[r,...t])};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var uv=()=>{if("u"<typeof window)return;let e=document.querySelector("#preview-frame");return(null==e?void 0:e.tagName)==="IFRAME"?e.contentDocument||document:(null==e?void 0:e.ownerDocument)||document};(0,rF.init_react_import)(),(0,rF.init_react_import)();var ug=e=>"u">typeof CSS&&"function"==typeof CSS.escape?CSS.escape(e):e,um=e=>`[data-puck-component="${ug(e)}"]`,u_=e=>`[data-puck-dropzone="${ug(e)}"]`,ub={duration:250,easing:"ease"},ux=e=>{var t,r;return null!=(r=null==(t=e.defaultView)?void 0:t.matchMedia("(prefers-reduced-motion: reduce)").matches)&&r},uy=(e,{zones:t,itemId:r,targetZone:n,getExpectedOrder:o,initialExpectedOrder:i=[]},a)=>{let l=new Set(i),s=0,c=()=>{var i;let u=e.querySelector(u_(n)),d=o(),p=null!=r?r:d.find(e=>!l.has(e)),h=p&&null!=(i=null==u?void 0:u.querySelector(`:scope > ${um(p)}:not([data-dnd-dragging]):not([data-dnd-placeholder])`))?i:null,f=u?Array.from(u.querySelectorAll(":scope > [data-puck-component]:not([data-dnd-dragging]):not([data-dnd-placeholder])")).map(e=>e.getAttribute("data-puck-component")):[],v=new Set(f),g=d.filter(e=>v.has(e)),m=f.length===g.length&&f.every((e,t)=>e===g[t]),_=t.every(t=>t===n||!p||!e.querySelector(`${u_(t)} > ${um(p)}`));if((!h||!m||!_)&&s<10){s++,requestAnimationFrame(c);return}a(h)};requestAnimationFrame(c)};(0,rF.init_react_import)();var uk=(e,t)=>{var r,n;return null!=(n=null==(r=e.indexes.zones[t])?void 0:r.contentIds)?n:[]},uw=(e,t)=>{let r=(0,rB.useAppStoreApi)();return(0,r_.useCallback)(n=>{var o,i,a,l,s;let c,u=Object.values(null!=(o=e.getState().previewIndex)?o:{}),d=t?u.find(e=>(null==e?void 0:e.props.id)===t&&!e.ghost):u.find(e=>(null==e?void 0:e.type)==="insert"),p=t?(null==d?void 0:d.linePlaceholder)||(null==d?void 0:d.type)==="insert":!!d;return i=d&&p?{itemId:"move"===d.type?t:void 0,targetZone:d.zone,getExpectedOrder:()=>uk(r.getState().state,d.zone)}:void 0,!(null!=(l=null==(c=null==(a=n.source.manager)?void 0:a.dragOperation)?void 0:c.canceled)&&l||(null==(s=null==c?void 0:c.target)?void 0:s.type)==="void")&&i?void(({feedbackElement:e,itemId:t,targetZone:r,getExpectedOrder:n})=>{var o;let i=e.ownerDocument,a=null!=(o=uv())?o:i;if(ux(i))return;let l=e.getBoundingClientRect(),s=n(),c=e.cloneNode(!0);c.removeAttribute("id"),c.removeAttribute("popover"),c.removeAttribute("data-puck-component"),c.removeAttribute("data-puck-dnd"),c.removeAttribute("data-dnd-dragging"),c.setAttribute("inert","true"),Object.assign(c.style,{position:"fixed",left:`${l.left}px`,top:`${l.top}px`,width:`${l.width}px`,height:`${l.height}px`,margin:"0",overflow:"hidden",pointerEvents:"none",transform:"none",transition:"none",translate:"none",zIndex:"2147483647"});let u=a.createElement("style");u.textContent=`
    ${t?`${um(t)} { visibility: hidden !important; }`:""}
    [data-puck-overlay] { opacity: 0 !important; }
  `,a.head.appendChild(u),i.body.appendChild(c);let d=()=>{c.remove(),u.remove()};uy(a,{zones:[r],itemId:t,targetZone:r,getExpectedOrder:n,initialExpectedOrder:s},e=>{if(!e)return void d();let r=e.getAttribute("data-puck-component");!t&&r&&(u.textContent+=`
          ${um(r)} { visibility: hidden !important; }
        `);let n=((e,t)=>{var r,n;let o=e.getBoundingClientRect();if(e.ownerDocument===t)return o;let i=((e,t)=>{var r,n;let o={x:0,y:0,scaleX:1,scaleY:1},i=null==(r=e.ownerDocument.defaultView)?void 0:r.frameElement;for(;i&&i!==t;){let e=i.getBoundingClientRect(),t=i.offsetWidth?e.width/i.offsetWidth:1,r=i.offsetHeight?e.height/i.offsetHeight:1;o.x+=e.left,o.y+=e.top,o.scaleX*=t,o.scaleY*=r,i=null==(n=i.ownerDocument.defaultView)?void 0:n.frameElement}return o})(e,null!=(n=null==(r=t.defaultView)?void 0:r.frameElement)?n:null);return{left:o.left*i.scaleX+i.x,top:o.top*i.scaleY+i.y,width:o.width*i.scaleX,height:o.height*i.scaleY}})(e,i);c.animate({left:[`${l.left}px`,`${n.left}px`],top:[`${l.top}px`,`${n.top}px`],width:[`${l.width}px`,`${n.width}px`],height:[`${l.height}px`,`${n.height}px`]},(0,rF.__spreadProps)((0,rF.__spreadValues)({},ub),{fill:"forwards"})).finished.catch(()=>void 0).then(d)})})((0,rF.__spreadProps)((0,rF.__spreadValues)({},i),{feedbackElement:n.feedbackElement})):(({element:e,feedbackElement:t,placeholder:r,translate:n})=>{var o;if(ux(t.ownerDocument))return;let i=null!=r?r:e,a={frameTransform:t.ownerDocument===i.ownerDocument?null:void 0},l=new i7(t,a),s=new i7(i,a),c=null!=(o=iJ(iU(t).translate))?o:n,u={x:c.x-(l.center.x-s.center.x),y:c.y-(l.center.y-s.center.y)};return t.setAttribute("data-dnd-dropping",""),t.animate({translate:[`${c.x}px ${c.y}px 0`,`${u.x}px ${u.y}px 0`]},ub).finished.catch(()=>void 0).then(()=>{t.removeAttribute("data-dnd-dropping")})})(n)},[r,e,t])};function uS(e,t){e.forEach(e=>{"function"==typeof e?e(t):e&&"object"==typeof e&&"current"in e&&(e.current=t)})}(0,rF.init_react_import)();var uI=(0,rw.get_class_name_factory_default)("DraggableComponent",{DraggableComponent:"_DraggableComponent_1627v_1","DraggableComponent-overlayWrapper":"_DraggableComponent-overlayWrapper_1627v_6","DraggableComponent-overlay":"_DraggableComponent-overlay_1627v_6","DraggableComponent-loadingOverlay":"_DraggableComponent-loadingOverlay_1627v_38","DraggableComponent--hover":"_DraggableComponent--hover_1627v_54","DraggableComponent--isSelected":"_DraggableComponent--isSelected_1627v_72","DraggableComponent-actionsOverlay":"_DraggableComponent-actionsOverlay_1627v_89","DraggableComponent-actions":"_DraggableComponent-actions_1627v_89","DraggableComponent-actionsAction":"_DraggableComponent-actionsAction_1627v_111"}),uj=({label:e,children:t,parentAction:r})=>(0,rV.jsxs)(rB.ActionBar,{children:[(0,rV.jsxs)(rB.ActionBar.Group,{children:[r,e&&(0,rV.jsx)(rB.ActionBar.Label,{label:e})]}),(0,rV.jsx)(rB.ActionBar.Group,{children:t})]}),uz=({children:e})=>(0,rV.jsx)(rV.Fragment,{children:e}),uE=({children:e,depth:t,componentType:r,id:n,index:o,zoneCompound:i,isLoading:a=!1,isSelected:l=!1,debug:s,label:c,autoDragAxis:u,userDragAxis:d,inDroppableZone:p=!0,itemRef:h})=>{let f=(0,rB.useAppStore)(e=>{var t;return(null==(t=e.selectedItem)?void 0:t.props.id)===n?e.zoomConfig.zoom:1}),v=(0,rB.useAppStore)(e=>e._experimentalFullScreenCanvas),g=(0,rB.useAppStore)(e=>e.overrides),m=(0,rB.useAppStore)(e=>e.dispatch),_=(0,rB.useAppStore)(e=>e.iframe),b=(0,r_.useRef)(0),y=(0,r_.useContext)(uu),[k,w]=(0,r_.useState)({}),S=(0,r_.useCallback)((e,t)=>{var r;null==(r=null==y?void 0:y.registerLocalZone)||r.call(y,e,t),w(r=>(0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{[e]:t}))},[w]),I=(0,r_.useCallback)(e=>{var t;null==(t=null==y?void 0:y.unregisterLocalZone)||t.call(y,e),w(t=>{let r=(0,rF.__spreadValues)({},t);return delete r[e],r})},[w]),j=Object.values(k).filter(Boolean).length>0,z=(0,rB.useAppStore)(rW(e=>{var t;return null==(t=e.state.indexes.nodes[n])?void 0:t.path})),E=(0,rB.useAppStore)(rW(e=>{let t=(0,rR.getItem)({index:o,zone:i},e.state);return e.permissions.getPermissions({item:t})})),C=(0,r_.useContext)(ud),A=(0,rB.useAppStoreApi)(),[P,M]=(0,r_.useState)(d||u),O=(0,r_.useMemo)(()=>cP(P),[P]),D=uw(C,n),{ref:T,isDragging:N,sortable:L}=sq({id:n,index:o,group:i,type:"component",data:{areaId:null==y?void 0:y.areaId,zone:i,index:o,componentType:r,containsActiveZone:j,depth:t,path:z||[],inDroppableZone:p},collisionPriority:t,collisionDetector:O,transition:{duration:200,easing:"cubic-bezier(0.2, 0, 0, 1)"},plugins:e=>[...e,aQ.configure({feedback:"clone",dropAnimation:D})]});(0,r_.useEffect)(()=>{let e=C.getState().enabledIndex[i];L.droppable.disabled=!e,L.draggable.disabled=!E.drag;let t=C.subscribe(e=>{L.droppable.disabled=!e.enabledIndex[i]});return R.current&&!E.drag?(R.current.setAttribute("data-puck-disabled",""),()=>{var e;null==(e=R.current)||e.removeAttribute("data-puck-disabled"),t()}):t},[E.drag,i]);let[,B]=(0,r_.useState)(0),R=(0,r_.useRef)(null),F=(0,r_.useCallback)(e=>{T(e),R.current!==e&&(R.current=e,B(e=>e+1),h&&uS([h],e))},[h,T]),[V,$]=(0,r_.useState)();(0,r_.useEffect)(()=>{var e,t,r;$(_.enabled?null==(e=R.current)?void 0:e.ownerDocument.body:null!=(r=null==(t=R.current)?void 0:t.closest("[data-puck-preview]"))?r:document.body)},[_.enabled]);let W=(0,r_.useCallback)(()=>{var e,t;if(!R.current)return;let r=R.current,n=r.getBoundingClientRect(),o=_.enabled?null:r.closest("[data-puck-preview]"),i=(()=>{let e=r;for(;e&&e!==document.documentElement;){if("fixed"===getComputedStyle(e).position)return!0;e=e.parentElement}return!1})(),a=null==o?void 0:o.getBoundingClientRect(),l=o?uc(o):{x:0,y:0},s=i?{x:0,y:0}:uc(r),c=i?{x:0,y:0}:{x:s.x-l.x-(null!=(e=null==a?void 0:a.left)?e:0),y:s.y-l.y-(null!=(t=null==a?void 0:a.top)?t:0)};return{left:`${n.left+c.x}px`,top:`${n.top+c.y}px`,height:`${n.height}px`,width:`${n.width}px`,position:i?"fixed":void 0}},[_.enabled]),[H,q]=(0,r_.useState)(),U=(0,r_.useRef)(null),Z=(0,r_.useRef)(null),Y=(0,r_.useCallback)(()=>{q(W()),h&&uS([h],R.current)},[W,h]),X=(0,r_.useCallback)(()=>{null==Z.current&&(Z.current=requestAnimationFrame(()=>{Z.current=null,Y()}))},[Y]);(0,r_.useEffect)(()=>()=>{null!=Z.current&&(cancelAnimationFrame(Z.current),Z.current=null)},[]),(0,r_.useEffect)(()=>{if(R.current){let e=new ResizeObserver(()=>{X()});return e.observe(R.current),()=>{e.disconnect()}}},[X,h]);let K=(0,rB.useAppStore)(e=>e.nodes.registerNode),J=(0,rB.useAppStore)(e=>e.nodes.unregisterNode),G=(0,r_.useCallback)(()=>{ed(!1)},[]),Q=(0,r_.useCallback)(()=>{ed(!0)},[]),ee=(0,r_.useRef)({sync:()=>null,hideOverlay:()=>null,showOverlay:()=>null});(0,r_.useLayoutEffect)(()=>{ee.current.sync=Y,ee.current.hideOverlay=G,ee.current.showOverlay=Q},[G,Q,Y]),(0,r_.useEffect)(()=>(K(n,ee.current),()=>{J(n)}),[n,K,J]);let et=(0,r_.useMemo)(()=>g.actionBar||uj,[g.actionBar]),er=(0,r_.useMemo)(()=>g.componentOverlay||uz,[g.componentOverlay]),en=(0,r_.useCallback)(e=>{C.getState().draggedItem||(e.target.closest("[data-puck-overlay-portal]")||e.stopPropagation(),v?m({type:"setUi",ui:{itemSelector:l?null:{index:o,zone:i}}}):m({type:"setUi",ui:{itemSelector:{index:o,zone:i}}}))},[o,i,n,l,v]),eo=(0,r_.useCallback)(()=>{let{nodes:e,zones:t}=A.getState().state.indexes,r=e[n],o=(null==r?void 0:r.parentId)?e[null==r?void 0:r.parentId]:null;if(!o||!r.parentId)return;let i=`${o.parentId}:${o.zone}`,a=t[i].contentIds.indexOf(r.parentId);m({type:"setUi",ui:{itemSelector:{zone:i,index:a}}})},[y,z]),ei=(0,r_.useCallback)(()=>{m({type:"duplicate",sourceIndex:o,sourceZone:i})},[o,i]),ea=(0,r_.useCallback)(()=>{m({type:"remove",index:o,zone:i})},[o,i]),[el,es]=(0,r_.useState)(!1),ec=ch(ud,e=>e.hoveringComponent===n);(0,r_.useEffect)(()=>{if(!R.current)return;let e=R.current,t=e=>{C.getState().draggedItem?N?es(!0):es(!1):es(!0),e.stopPropagation()},r=e=>{e.stopPropagation(),es(!1)};return e.setAttribute("data-puck-component",n),e.setAttribute("data-puck-dnd",n),e.style.position="relative",e.addEventListener("click",en),e.addEventListener("mouseover",t),e.addEventListener("mouseout",r),()=>{e.removeAttribute("data-puck-component"),e.removeAttribute("data-puck-dnd"),e.removeEventListener("click",en),e.removeEventListener("mouseover",t),e.removeEventListener("mouseout",r)}},[R.current,en,j,i,n,N,p]);let[eu,ed]=(0,r_.useState)(!1),[ep,eh]=(0,r_.useState)(!0),[ef,ev]=(0,r_.useTransition)();(0,r_.useEffect)(()=>{ev(()=>{el||ec||l?(X(),ed(!0),em(!1)):ed(!1)})},[el,ec,l,_]);let[eg,em]=(0,r_.useState)(!1),e_=uf(e=>{e?ev(()=>{Y(),eh(!0)}):eh(!1)});(0,r_.useEffect)(()=>{N&&em(!0)},[N]),(0,r_.useEffect)(()=>{if(eg)return e_()},[eg,e_]),(0,r_.useEffect)(()=>{if(!ep||!(l||N))return;let e=R.current;if(!e)return;let t=e.ownerDocument,r=t.defaultView;if(!r)return;b.current=0,X();let n=()=>X(),o=()=>X();t.addEventListener("scroll",n,!0),r.addEventListener("resize",o);let i=0,a=e=>{if(e-b.current>=100){b.current=e;let t=R.current;if(t){let e=t.getBoundingClientRect(),r=U.current;(!r||Math.abs(e.x-r.x)>.5||Math.abs(e.y-r.y)>.5||Math.abs(e.width-r.width)>.5||Math.abs(e.height-r.height)>.5)&&(U.current=e,X())}}i=requestAnimationFrame(a)};return i=requestAnimationFrame(a),()=>{t.removeEventListener("scroll",n,!0),r.removeEventListener("resize",o),cancelAnimationFrame(i)}},[ep,l,N,X]);let eb=(0,r_.useCallback)(e=>{if(e&&e.ownerDocument.defaultView){let t=e.getBoundingClientRect(),r=t.x<0,n=t.y;r&&(e.style.transformOrigin="left top",e.style.left="0px"),n<0&&(e.style.top="12px",r||(e.style.transformOrigin="right top"))}},[f]),ex=(0,r_.useRef)(null);(0,r_.useEffect)(()=>{eb(ex.current)},[ex.current,eb]),(0,r_.useEffect)(()=>{if(d)return void M(d);if(R.current){let e=window.getComputedStyle(R.current);if("inline"===e.display||"inline-block"===e.display)return void M("x")}M(u)},[R,d,u]);let ey=(0,rB.useMessage)("action-selectparent"),ek=(0,rB.useMessage)("action-duplicate"),ew=(0,rB.useMessage)("action-delete"),eS=(0,r_.useMemo)(()=>(null==y?void 0:y.areaId)&&(null==y?void 0:y.areaId)!=="root"&&(0,rV.jsx)(rB.ActionBar.Action,{onClick:eo,label:ey,children:(0,rV.jsx)(rB.CornerLeftUp,{size:16})}),[null==y?void 0:y.areaId,ey]),eI=(0,r_.useMemo)(()=>(0,rF.__spreadProps)((0,rF.__spreadValues)({},y),{areaId:n,zoneCompound:i,index:o,depth:t+1,registerLocalZone:S,unregisterLocalZone:I}),[y,n,i,o,t,S,I]),ej=(0,rB.useAppStore)(e=>{var t;return(null==(t=e.currentRichText)?void 0:t.inlineComponentId)===n?e.currentRichText:null}),ez=E.duplicate||E.delete;return(0,rV.jsxs)(uh,{value:eI,children:[ep&&eu&&(0,lx.createPortal)((0,rV.jsxs)("div",{className:uI({isSelected:l,isDragging:N,hover:el||ec}),style:(0,rF.__spreadValues)({},H),"data-puck-overlay":!0,children:[s,a&&(0,rV.jsx)("div",{className:uI("loadingOverlay"),children:(0,rV.jsx)(rB.Loader,{})}),(0,rV.jsx)("div",{className:uI("actionsOverlay"),style:{top:52/f},children:(0,rV.jsx)("div",{className:uI("actions"),style:{transform:`scale(${1/f}`,top:-44/f,right:0,paddingLeft:8,paddingRight:8},ref:ex,children:(0,rV.jsxs)(et,{parentAction:eS,label:c,children:[ej&&(0,rV.jsxs)(rV.Fragment,{children:[(0,rV.jsx)(rx.LoadedRichTextMenu,{editor:ej.editor,field:ej.field,inline:!0,readOnly:!1}),ez&&(0,rV.jsx)(rB.ActionBar.Separator,{})]}),E.duplicate&&(0,rV.jsx)(rB.ActionBar.Action,{onClick:ei,label:ek,children:(0,rV.jsx)(rB.Copy,{className:uI("actionsAction")})}),E.delete&&(0,rV.jsx)(rB.ActionBar.Action,{onClick:ea,label:ew,children:(0,rV.jsx)(rB.Trash,{className:uI("actionsAction")})})]})})}),(0,rV.jsx)("div",{className:uI("overlayWrapper"),children:(0,rV.jsx)(er,{componentId:n,componentType:r,hover:el,isSelected:l,children:(0,rV.jsx)("div",{className:uI("overlay")})})})]}),V||document.body),e(F)]})};(0,rF.init_react_import)();var uC={DropZone:"_DropZone_wc2ks_1","DropZone--hasChildren":"_DropZone--hasChildren_wc2ks_11","DropZone--isAreaSelected":"_DropZone--isAreaSelected_wc2ks_24","DropZone--hoveringOverArea":"_DropZone--hoveringOverArea_wc2ks_25","DropZone--isRootZone":"_DropZone--isRootZone_wc2ks_25","DropZone-item":"_DropZone-item_wc2ks_39","DropZone-linePlaceholder":"_DropZone-linePlaceholder_wc2ks_43","DropZone-hitbox":"_DropZone-hitbox_wc2ks_55","DropZone--isEnabled":"_DropZone--isEnabled_wc2ks_63","DropZone--isAnimating":"_DropZone--isAnimating_wc2ks_74"};(0,rF.init_react_import)();var uA=(e,{allow:t,disallow:r})=>{if(!e)return!0;let n=new Set(t),o=new Set(r);return r?(o.has(e)&&n.has(e)&&o.delete(e),!o.has(e)):!t||n.has(e)};(0,rF.init_react_import)(),(0,rF.init_react_import)();var uP={Drawer:"_Drawer_1n90m_1","Drawer-draggable":"_Drawer-draggable_1n90m_8","Drawer-draggableBg":"_Drawer-draggableBg_1n90m_12","DrawerItem-draggable":"_DrawerItem-draggable_1n90m_22","DrawerItem--disabled":"_DrawerItem--disabled_1n90m_38",DrawerItem:"_DrawerItem_1n90m_22","Drawer--isDraggingFrom":"_Drawer--isDraggingFrom_1n90m_48","DrawerItem-name":"_DrawerItem-name_1n90m_72"};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var uM=class{constructor(e,t){var r;this.scaleFactor=1,this.frameEl=null,this.frameRect=null,this.target=e,this.original=t,this.frameEl=document.querySelector("iframe#preview-frame"),this.frameEl&&(this.frameRect=this.frameEl.getBoundingClientRect(),this.scaleFactor=this.frameRect.width/((null==(r=this.frameEl.contentWindow)?void 0:r.innerWidth)||1))}get x(){return this.original.x}get y(){return this.original.y}get global(){return document!==this.target.ownerDocument&&this.frameRect?{x:this.x*this.scaleFactor+this.frameRect.left,y:this.y*this.scaleFactor+this.frameRect.top}:this.original}get frame(){return document===this.target.ownerDocument&&this.frameRect?{x:(this.x-this.frameRect.left)/this.scaleFactor,y:(this.y-this.frameRect.top)/this.scaleFactor}:this.original}};(0,rF.init_react_import)();var uO="u">typeof PointerEvent?PointerEvent:Event,uD=class extends uO{constructor(e,t){super(e,t),this._originalTarget=null,this.originalTarget=t.originalTarget}set originalTarget(e){this._originalTarget=e}get originalTarget(){return this._originalTarget}};(0,rF.init_react_import)(),(0,rF.init_react_import)();var uT=(e,{isDraggingBetweenSlots:t=!1,isNewComponent:r=!1}={})=>"auto"===e?t||r?"static":"fluid":e;(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var uN=(e,t)=>{let r=e.indexes.nodes[t];if(!r)return;let n=`${r.parentId}:${r.zone}`,o=e.indexes.zones[n].contentIds.indexOf(t);return{zone:n,index:o}};function uL(e,t,r="force",n=!1,o){return(0,rF.__async)(this,null,function*(){let i=yield t().resolveComponentData(e,r);if(!i.didChange&&!n)return;let a=uN(t().state,i.node.props.id);a?t().dispatch({type:"replace",data:(0,rS.toComponent)(i.node),destinationIndex:a.index,destinationZone:a.zone,ui:o}):console.warn(`Warning: Could not find component with id "${e.props.id}" to resolve its data. Component may have been removed or the id is invalid.`)})}(0,rF.init_react_import)();var uB=(e,t,r,n)=>(0,rF.__async)(null,null,function*(){var o,i,a;(0,n.getState().dispatch)({type:"move",sourceIndex:t.index,sourceZone:null!=(o=t.zone)?o:rS.rootDroppableId,destinationIndex:r.index,destinationZone:null!=(i=r.zone)?i:rS.rootDroppableId,recordHistory:!1});let l=null==(a=n.getState().state.indexes.nodes[e])?void 0:a.data;l&&(yield uL(l,n.getState,"move"))});function uR(e){return e?function e(t){return t?t.getAttribute("dir")||e(t.parentElement):"ltr"}(e):"ltr"}(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var uF=(e,t,r)=>Math.max(t,Math.min(r,e)),uV=(e,t)=>{let r=uF(e.x,Math.min(t.x1,t.x2),Math.max(t.x1,t.x2)),n=uF(e.y,Math.min(t.y1,t.y2),Math.max(t.y1,t.y2));return Math.hypot(e.x-r,e.y-n)};(0,rF.init_react_import)();var u$=(e,t,r=t.getComputedStyle(e))=>{let n=r.display,o="rtl"===uR(e);if("flex"===n||"inline-flex"===n){let e=r.flexDirection;if(e.startsWith("row")){let t="row-reverse"===e;return{axis:"x",reversed:o?!t:t}}return{axis:"y",reversed:"column-reverse"===e}}if("grid"===n||"inline-grid"===n){let e;return r.gridAutoFlow.startsWith("column")||((e=r.gridTemplateColumns.replace(/\[[^\]]*\]/g," ").trim())&&"none"!==e?e.split(/\s+/).length:0)>1?{axis:"x",reversed:o}:{axis:"y",reversed:!1}}return{axis:"y",reversed:!1}},uW=({axis:e,reversed:t})=>{let r="x"===e,n=t?-1:1;return{horizontal:r,reversed:t,forward:n,start:e=>r?t?e.right:e.left:t?e.bottom:e.top,end:e=>r?t?e.left:e.right:t?e.top:e.bottom,isBefore:(e,t)=>n>0?e<=t:e>=t}},uH=(e,t,r)=>{var n,o;let i=e.ownerDocument.defaultView;if(!i)return null;let a=new Map(r.map((e,t)=>[e,t])),l=Array.from(e.querySelectorAll(":scope > [data-puck-component]:not([data-dnd-dragging]):not([data-dnd-placeholder])")).map(e=>{var t,r;return{index:null!=(r=a.get(null!=(t=e.getAttribute("data-puck-component"))?t:""))?r:-1,el:e}}).filter(e=>-1!==e.index).sort((e,t)=>e.index-t.index).map(({index:e,el:t})=>({index:e,rect:t.getBoundingClientRect()}));if(0===l.length)return 0;let{horizontal:s,reversed:c,start:u,end:d}=uW(u$(e,i)),p=(e,t,r,n=[r])=>{let o=1/0,i=-1/0;for(let e of n)o=Math.min(o,s?e.top:e.left),i=Math.max(i,s?e.bottom:e.right);return s?{index:e,x1:t,x2:t,y1:r.top,y2:r.bottom,laneStart:o,laneEnd:i}:{index:e,x1:r.left,x2:r.right,y1:t,y2:t,laneStart:o,laneEnd:i}},h=[],f=(e,t,r)=>p(e,"before"===r?u(t):d(t),t);for(let e=0;e<=l.length;e++){let t=l[e-1],r=l[e];if(r)if(t)if(r.index-t.index>1)h.push(f(t.index+1,t.rect,"after")),h.push(f(r.index,r.rect,"before"));else if(c?d(t.rect)<u(r.rect):d(t.rect)>u(r.rect))h.push(f(r.index,r.rect,"before")),h.push(f(r.index,t.rect,"after"));else{let e=(d(t.rect)+u(r.rect))/2;h.push(p(r.index,e,r.rect,[t.rect,r.rect]))}else h.push(f(r.index,r.rect,"before"));else h.push(f(t.index+1,t.rect,"after"))}let v=s?t.y:t.x,g=null,m=1/0,_=null,b=1/0;for(let e of h){let r=uV(t,e);r<m&&(m=r,g=e),v>=e.laneStart&&v<=e.laneEnd&&r<b&&(b=r,_=e)}return null!=(o=null==(n=null!=_?_:g)?void 0:n.index)?o:null};(0,rF.init_react_import)();var uq=(e,t)=>{var r;let n=document.querySelector("iframe#preview-frame");if(!n||e.ownerDocument!==n.contentDocument)return t;let o=n.getBoundingClientRect(),i=o.width/((null==(r=n.contentWindow)?void 0:r.innerWidth)||1);return i>0?{x:(t.x-o.left)/i,y:(t.y-o.top)/i}:t},uU=(0,r_.createContext)({dragListeners:{}}),uZ=({children:e,disableAutoScroll:t,behavior:r="auto"})=>{let n,o,i,a,l,s,c,u,d=(0,rB.useAppStore)(e=>e.dispatch),p=(0,rB.useAppStore)(e=>e.instanceId),h=(0,rB.useAppStoreApi)(),f=(0,r_.useRef)(null),v=(n=(0,r_.useRef)(null),(0,r_.useCallback)(e=>{cC.setState({fallbackEnabled:!1});let t=(0,rR.generateId)();n.current=t,setTimeout(()=>{n.current===t&&(cC.setState({fallbackEnabled:!0}),e.collisionObserver.forceUpdate(!0))},100)},[])),[g]=(0,r_.useState)(()=>{let e=new Map;return(0,rH.createStore)(()=>({zoneDepthIndex:{},nextZoneDepthIndex:{},areaDepthIndex:{},nextAreaDepthIndex:{},draggedItem:null,previewIndex:{},enabledIndex:{},hoveringComponent:null,registerRootVirtualizer:(t,r)=>{e.set(t,r)},unregisterRootVirtualizer:t=>{e.delete(t)},scrollToComponent:t=>{let r=Array.from(e.values());if(r.length>0)for(let e of r){let r=e.resolveIndex(t);r<0||e.virtualizer.scrollToIndex(r,{behavior:"auto",align:"auto"})}else{let e=uv(),r=null==e?void 0:e.querySelector(um(t));null==r||r.scrollIntoView({behavior:"smooth"})}}}))}),m=(0,r_.useCallback)(e=>{let{zoneDepthIndex:t={},areaDepthIndex:r={}}=g.getState()||{},n=Object.keys(t).length>0,o=Object.keys(r).length>0,i=!1,a=!1;return e.zone&&!t[e.zone]?i=!0:!e.zone&&n&&(i=!0),e.area&&!r[e.area]?a=!0:!e.area&&o&&(a=!0),{zoneChanged:i,areaChanged:a}},[g]),_=(0,r_.useCallback)((e,t)=>{let{zoneChanged:r,areaChanged:n}=m(e);(r||n)&&(g.setState({zoneDepthIndex:e.zone?{[e.zone]:!0}:{},areaDepthIndex:e.area?{[e.area]:!0}:{}}),v(t),setTimeout(()=>{t.collisionObserver.forceUpdate(!0)},50),f.current=null)},[g]),b=(0,sZ.useDebouncedCallback)(_,100),y=()=>{b.cancel(),f.current=null};(0,r_.useEffect)(()=>{},[]);let[k]=(0,r_.useState)(()=>[...t?lv.filter(e=>e!==a9):lv,(({onChange:e},t)=>class extends oD{constructor(r,n){if(super(r),"u"<typeof window)return;this.registerEffect(()=>{var n;let o,i,a=(n=n=>{let o=new uM(n instanceof uD&&n.originalTarget||n.target,{x:n.clientX,y:n.clientY});document.elementsFromPoint(o.global.x,o.global.y).some(e=>e.id===t)&&e(((e,t)=>{var r;let n=((e,t)=>{let r=[],n=e.target.ownerDocument.elementsFromPoint(e.x,e.y),o=n.find(e=>e.getAttribute("data-puck-preview")),i=n.find(e=>e.getAttribute("data-puck-drawer"));if(i&&(n=[i]),o){let t=uv();t&&(n=t.elementsFromPoint(e.frame.x,e.frame.y))}if(n)for(let o=0;o<n.length;o++){let i=n[o],a=i.getAttribute("data-puck-dropzone"),l=i.getAttribute("data-puck-dnd"),s=i.hasAttribute("data-puck-dnd-void");if((a||l)&&!s){let t=i.getBoundingClientRect(),r={left:t.left+6,right:t.right-6,top:t.top+6,bottom:t.bottom-6};if(e.frame.x<r.left||e.frame.x>r.right||e.frame.y>r.bottom||e.frame.y<r.top)continue}if(a){let e=t.registry.droppables.get(a);e&&r.push(e)}if(l){let e=t.registry.droppables.get(l);e&&r.push(e)}}return r})(e,t);if(n.length>0){let e=n.sort((e,t)=>{let r=e.data,n=t.data;return r.depth>n.depth?1:n.depth>r.depth?-1:0}),o=t.dragOperation.source,i=e.findIndex(e=>e.id===(null==o?void 0:o.id)),a=null==o?void 0:o.id,l=[...e];a&&i>-1&&l.splice(i,1),(l=l.filter(e=>{let t=e.data;if(a&&i>-1&&t.path.indexOf(a)>-1)return!1;if("dropzone"===e.type){let t=e.data;if(!t.isDroppableTarget||t.areaId===a)return!1}else if("component"===e.type&&!e.data.inDroppableZone)return!1;return!0})).reverse();let s=l[0];if(!s)return{zone:null,area:null};let c=s.data,u="containsActiveZone"in c;return{zone:(e=>{let t=null==e?void 0:e.id;if(!e)return null;if("component"===e.type){let r=e.data;t=r.containsActiveZone?null:r.zone}else if("void"===e.type)return"void";return t})(s),area:u&&c.containsActiveZone?l[0].id:null==(r=l[0])?void 0:r.data.areaId}}return{zone:rS.rootDroppableId,area:rS.rootAreaId}})(o,r),r)},i=0,function(...e){let t=performance.now(),r=this;if(t-i>=50)n.apply(r,e),i=t;else{let a;null==o||o(),a=setTimeout(()=>{n.apply(r,e),i=performance.now()},50-(t-i)),o=()=>clearTimeout(a)}}),l=e=>{a(e)};return document.body.addEventListener("pointermove",l,{capture:!0}),()=>{document.body.removeEventListener("pointermove",l,{capture:!0})}})}})({onChange:(e,t)=>{let r=g.getState(),{zoneChanged:n,areaChanged:o}=m(e),i=t.dragOperation.status.dragging;if(o||n){let t={},r={};e.zone&&(t={[e.zone]:!0}),e.area&&(r={[e.area]:!0}),g.setState({nextZoneDepthIndex:t,nextAreaDepthIndex:r})}if("void"!==e.zone&&(null==r?void 0:r.zoneDepthIndex.void))return void _(e,t);if(o){if(i){let r=f.current;r&&r.area===e.area&&r.zone===e.zone||(y(),b(e,t),f.current=e)}else y(),_(e,t);return}n&&_(e,t),y()}},p)]),w=cw(),[S,I]=(0,r_.useState)({}),j=(0,r_.useRef)(null),z=(0,r_.useRef)(void 0),{getTargetIndex:E,setActive:C,startScrollTracking:A,stopScrollTracking:P,update:M}=(o=(0,rB.useAppStoreApi)(),i=(0,r_.useRef)(null),a=(0,r_.useCallback)(e=>{var t;let r=null==(t=uv())?void 0:t.querySelector("[data-puck-entry]");e?null==r||r.setAttribute("data-puck-line-drag","true"):null==r||r.removeAttribute("data-puck-line-drag")},[]),l=(0,r_.useCallback)((e,t)=>{var r;let n=null==(r=uv())?void 0:r.querySelector(u_(e));if(!n)return null;let i=uq(n,t.dragOperation.position.current);return uH(n,i,uk(o.getState().state,e))},[o]),s=(0,r_.useCallback)(e=>{var t;let{previewIndex:r={}}=g.getState(),n=Object.values(r).find(e=>null==e?void 0:e.linePlaceholder);if(!n)return;let i=null==(t=uv())?void 0:t.querySelector(u_(n.zone));if(!i)return;let a=uq(i,e.dragOperation.position.current),l=i.getBoundingClientRect();if(!(a.x>=l.left&&a.x<=l.right&&a.y>=l.top&&a.y<=l.bottom))return;let s=uH(i,a,uk(o.getState().state,n.zone));null!==s&&s!==n.index&&g.setState({previewIndex:(0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{[n.zone]:(0,rF.__spreadProps)((0,rF.__spreadValues)({},n),{index:s})})})},[o,g]),c=(0,r_.useCallback)(()=>{var e;null==(e=i.current)||e.call(i),i.current=null},[]),u=(0,r_.useCallback)(e=>{c();let t=uv();if(!t)return;let r=null,n=()=>{null===r&&(r=requestAnimationFrame(()=>{r=null,s(e)}))};t.addEventListener("scroll",n,{capture:!0,passive:!0}),i.current=()=>{null!==r&&cancelAnimationFrame(r),t.removeEventListener("scroll",n,{capture:!0})}},[c,s]),(0,r_.useEffect)(()=>c,[c]),{getTargetIndex:l,setActive:a,startScrollTracking:u,stopScrollTracking:c,update:s}),O=(0,r_.useMemo)(()=>({mode:"edit",areaId:"root",depth:0}),[]);return(0,rV.jsx)(uU.Provider,{value:{dragListeners:S,setDragListeners:I},children:(0,rV.jsx)(lF,{plugins:k,sensors:w,onDragEnd:(e,t)=>{var r,n;let o;P();let i=null==(r=uv())?void 0:r.querySelector("[data-puck-entry]");null==i||i.removeAttribute("data-puck-dragging");let{source:a,target:l}=e.operation;if(!a){C(!1),g.setState({draggedItem:null});return}let{zone:s,index:c}=a.data,{previewIndex:u={}}=g.getState()||{},p=null!=(n=Object.values(u).find(e=>(null==e?void 0:e.props.id)===a.id&&!e.ghost))?n:null,f=!e.canceled&&(null==l?void 0:l.type)!=="void"&&(null==p?void 0:p.linePlaceholder)?(({zones:e,itemId:t,targetZone:r,getExpectedOrder:n})=>{let o=uv();if(!o||ux(o))return()=>{};let i=Array.from(new Set(e)).map(e=>`${u_(e)} > [data-puck-component]:not([data-dnd-dragging]):not([data-dnd-placeholder])`).join(", "),a=()=>{let e=new Map;return o.querySelectorAll(i).forEach(r=>{let n=r.getAttribute("data-puck-component");n&&n!==t&&e.set(n,{el:r,rect:r.getBoundingClientRect()})}),e},l=a(),s=n();return()=>{uy(o,{zones:e,itemId:t,targetZone:r,getExpectedOrder:n,initialExpectedOrder:s},()=>{a().forEach(({el:e,rect:t},r)=>{var n;let o=null==(n=l.get(r))?void 0:n.rect;if(!o)return;let i=o.x-t.x,a=o.y-t.y;1>Math.abs(i)&&1>Math.abs(a)||e.animate({translate:[`${i}px ${a}px 0`,"0px 0px 0"]},ub)})})}})({zones:z.current?[z.current.zone,p.zone]:[p.zone],itemId:"move"===p.type?p.props.id:void 0,targetZone:p.zone,getExpectedOrder:()=>uk(h.getState().state,p.zone)}):null;o=nl(()=>{"idle"===a.status&&((()=>{var r,n,o,i,a;if(C(!1),g.setState({draggedItem:null}),e.canceled||(null==l?void 0:l.type)==="void"){g.setState({previewIndex:{}}),null==(r=S.dragend)||r.forEach(r=>{r(e,t)}),d({type:"setUi",ui:{itemSelector:null,isDragging:!1}});return}let u=p&&p.linePlaceholder&&z.current&&p.zone===z.current.zone&&p.index>z.current.index?p.index-1:null!=(n=null==p?void 0:p.index)?n:c;if(p){if(g.setState({previewIndex:{}}),"insert"===p.type){let e,t,r;e=p.componentType,t=p.zone,r=p.index,(0,rF.__async)(null,null,function*(){let{getState:n}=h,o=(0,rR.generateId)(e),i={type:"insert",componentType:e,destinationIndex:r,destinationZone:t,id:o},a=n().state,l=(0,rR.insertAction)(a,i,n()),s=n().dispatch;s((0,rF.__spreadProps)((0,rF.__spreadValues)({},i),{recordHistory:!0}));let c={index:r,zone:t};s({type:"setUi",ui:{itemSelector:c}});let u=(0,rR.getItem)(c,l);u&&(yield uL(u,n,"insert"))})}else z.current&&uB(p.props.id,z.current,(0,rF.__spreadProps)((0,rF.__spreadValues)({},p),{index:u}),h);null==f||f()}let v=(null==(o=z.current)?void 0:o.zone)!==(null==p?void 0:p.zone)||(null==(i=z.current)?void 0:i.index)!==u;d({type:"setUi",ui:{itemSelector:p?{index:u,zone:p.zone}:{index:c,zone:s},isDragging:!1},recordHistory:v}),null==(a=S.dragend)||a.forEach(r=>{r(e,t)})})(),null==o||o())})},onDragMove:(e,t)=>{var r;M(t),null==(r=S.dragmove)||r.forEach(r=>{r(e,t)})},onDragOver:(e,t)=>{var n,o,i,a,l,s;if(e.preventDefault(),!(null==(n=g.getState())?void 0:n.draggedItem))return;y();let{source:c,target:u}=e.operation;if(!u||!c||"void"===u.type)return;let[d]=c.id.split(":"),[p]=u.id.split(":"),f=c.data,v=f.zone,m=f.index,_="",b=0;if("component"===u.type){let e=u.data;_=e.zone;let r=null==(o=t.collisionObserver.collisions[0])?void 0:o.data;b=cO({position:cM(null==r?void 0:r.direction,uR(u.element)),sourceIndex:m,targetIndex:e.index,isSameZone:v===_})}else _=u.id.toString(),b=0;let k=(null==(i=h.getState().state.indexes.nodes[u.id])?void 0:i.path)||[];if(!(p===d||k.find(e=>{let[t]=e.split(":");return t===d}))){if("new"===j.current){let e="static"===uT(r,{isNewComponent:!0});e&&(b=null!=(a=E(_,t))?a:b),C(e),g.setState({previewIndex:{[_]:{componentType:f.componentType,type:"insert",index:b,zone:_,element:c.element,props:{id:c.id.toString()},linePlaceholder:e}}})}else{z.current||(z.current={zone:f.zone,index:f.index});let e=(0,rR.getItem)(z.current,h.getState().state);if(e){let n=z.current.zone,o=n!==_,i="static"===uT(r,{isDraggingBetweenSlots:o});i&&(b=null!=(l=E(_,t))?l:b),C(i);let a={[_]:{componentType:f.componentType,type:"move",index:b,zone:_,props:e.props,element:c.element,linePlaceholder:i}};if(i&&o){let t=g.getState().previewIndex[n],r=z.current.index;t&&!t.linePlaceholder&&(r=t.index),a[n]={componentType:f.componentType,type:"move",index:r,zone:n,props:e.props,element:c.element,ghost:!0}}g.setState({previewIndex:a})}}null==(s=S.dragover)||s.forEach(r=>{r(e,t)})}},onDragStart:(e,t)=>{var n;"fluid"!==r&&A(t);let{source:o}=e.operation;if((null==o?void 0:o.type)==="component"){let e=o.data,t={zone:e.zone,index:e.index};z.current=t;let n=(0,rR.getItem)(t,h.getState().state);if(n){let t="static"===uT(r);C(t),g.setState({previewIndex:{[e.zone]:{componentType:e.componentType,type:"move",index:e.index,zone:e.zone,props:n.props,element:o.element,linePlaceholder:t}}})}}null==(n=S.dragstart)||n.forEach(r=>{r(e,t)})},onBeforeDragStart:e=>{var t,r,n,o;j.current=(null==(t=e.operation.source)?void 0:t.type)==="drawer"?"new":"existing",z.current=void 0,g.setState({draggedItem:e.operation.source}),(null==(r=h.getState().selectedItem)?void 0:r.props.id)!==(null==(n=e.operation.source)?void 0:n.id)?d({type:"setUi",ui:{itemSelector:null,isDragging:!0},recordHistory:!1}):d({type:"setUi",ui:{isDragging:!0},recordHistory:!1});let i=null==(o=uv())?void 0:o.querySelector("[data-puck-entry]");null==i||i.setAttribute("data-puck-dragging","true"),C(!1)},children:(0,rV.jsx)(up,{store:g,children:(0,rV.jsx)(uh,{value:O,children:e})})})})},uY=({children:e,disableAutoScroll:t,behavior:r})=>"LOADING"===(0,rB.useAppStore)(e=>e.status)?e:(0,rV.jsx)(uZ,{disableAutoScroll:t,behavior:r,children:e}),uX=(0,rw.get_class_name_factory_default)("Drawer",uP),uK=(0,rw.get_class_name_factory_default)("DrawerItem",uP),uJ=({children:e,name:t,label:r,dragRef:n,isDragDisabled:o})=>{let i=(0,r_.useMemo)(()=>e||(({children:e})=>(0,rV.jsx)("div",{className:uK("default"),children:e})),[e]);return(0,rV.jsx)("div",{className:uK({disabled:o}),ref:n,onMouseDown:e=>e.preventDefault(),"data-testid":n?`drawer-item:${t}`:"","data-puck-drawer-item":!0,children:(0,rV.jsx)(i,{name:t,children:(0,rV.jsx)("div",{className:uK("draggableWrapper"),children:(0,rV.jsxs)("div",{className:uK("draggable"),children:[(0,rV.jsx)("div",{className:uK("name"),children:null!=r?r:t}),(0,rV.jsx)("div",{className:uK("icon"),children:(0,rV.jsx)(c_,{})})]})})})})},uG=({children:e,name:t,label:r,id:n,isDragDisabled:o})=>{let i=uw((0,r_.useContext)(ud)),{ref:a}=function(e){let{disabled:t,data:r,element:n,handle:o,id:i,modifiers:a,sensors:l,plugins:s}=e,c=l$(t=>new l_(lC(lT({},e),lA({register:!1,handle:ly(o),element:ly(n)})),t)),u=lw(c,lW);return lj(i,()=>c.id=i),lz(o,e=>c.handle=e),lz(n,e=>c.element=e),lj(r,()=>r&&(c.data=r)),lj(t,()=>c.disabled=!0===t),lj(l,()=>c.sensors=l),lj(a,()=>c.modifiers=a,void 0,nM),lj(s,()=>c.plugins=s,void 0,nM),lj(e.alignment,()=>c.alignment=e.alignment),{draggable:u,get isDragging(){return u.isDragging},get isDropping(){return u.isDropping},get isDragSource(){return u.isDragSource},handleRef:(0,r_.useCallback)(e=>{c.handle=null!=e?e:void 0},[c]),ref:(0,r_.useCallback)(e=>{var t,r;(e||null==(t=c.element)||!t.isConnected||(null==(r=c.manager)?void 0:r.dragOperation.status.idle))&&(c.element=null!=e?e:void 0)},[c])}}({id:n,data:{componentType:t},disabled:o,type:"drawer",plugins:[aQ.configure({dropAnimation:i})]});return(0,rV.jsxs)("div",{className:uX("draggable"),children:[(0,rV.jsx)("div",{className:uX("draggableBg"),children:(0,rV.jsx)(uJ,{name:t,label:r,children:e})}),(0,rV.jsx)("div",{className:uX("draggableFg"),children:(0,rV.jsx)(uJ,{name:t,label:r,dragRef:a,isDragDisabled:o,children:e})})]})},uQ=({children:e,droppableId:t,direction:r})=>{t&&console.error("Warning: The `droppableId` prop on Drawer is deprecated and no longer required."),r&&console.error("Warning: The `direction` prop on Drawer is deprecated and no longer required to achieve multi-directional dragging.");let n=ut(),{ref:o}=l3({id:n,type:"void",collisionPriority:0});return(0,rV.jsx)("div",{className:uX(),ref:o,"data-puck-dnd":n,"data-puck-drawer":!0,"data-puck-dnd-void":!0,children:e})};uQ.Item=({name:e,children:t,id:r,label:n,index:o,isDragDisabled:i})=>{let a=r||e,[l,s]=(0,r_.useState)((0,rR.generateId)(a));return void 0!==o&&console.error("Warning: The `index` prop on Drawer.Item is deprecated and no longer required."),!function(e,t,r=[]){let{setDragListeners:n}=(0,r_.useContext)(uU);(0,r_.useEffect)(()=>{n&&n(r=>(0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{[e]:[...r[e]||[],t]}))},r)}("dragend",()=>{s((0,rR.generateId)(a))},[a]),(0,rV.jsx)("div",{children:(0,rV.jsx)(uG,{name:e,label:n,id:l,isDragDisabled:i,children:t})},l)},(0,rF.init_react_import)();var u0=(e,t)=>e.getState().state.indexes.zones[t].contentIds.length;(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var u1=({componentId:e,zone:t})=>{let r=(0,rB.useAppStore)(e=>e.config),n=(0,rB.useAppStore)(e=>e.metadata),o=(0,rB.useAppStore)(rW(r=>{var n,o;let i=r.state.indexes;return(null!=(o=null==(n=i.zones[`${e}:${t}`])?void 0:n.contentIds)?o:[]).map(e=>i.nodes[e].flatData)}));return(0,rV.jsx)(rD,{content:o,zone:t,config:r,metadata:n})};function u2(e,t,r,n,o){let i=(0,r_.useRef)(null),a=(0,r_.useRef)(null),l=(0,r_.useRef)(t.props),s=(0,r_.useMemo)(()=>rz(r,n,o),[r,n,o]),c=(0,r_.useMemo)(()=>{var r,n,o,c;let u,d="root"===t.type?e.root:null==(r=e.components)?void 0:r[t.type],p=null!=(n=null==d?void 0:d.fields)?n:{},h=i.current!==s,f=!1;if(!a.current||h)for(let e in t.props)(null==(o=p[e])?void 0:o.type)==="slot"&&(f=!0);else for(let e of(u=["id"],new Set([...Object.keys(t.props),...Object.keys(a.current)])))t.props[e]!==a.current[e]&&(u.push(e),(null==(c=p[e])?void 0:c.type)==="slot"&&(f=!0));let v=(0,rS.mapFields)(t,s,e,!1,f,u).props;return a.current=t.props,i.current=s,l.current=u?(0,rF.__spreadValues)((0,rF.__spreadValues)({},l.current),v):v,l.current},[e,t,s]);return(0,r_.useMemo)(()=>(0,rF.__spreadValues)((0,rF.__spreadValues)({},t.props),c),[t.props,c])}(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var u4=(e,t={})=>{if(!e)return;let{disableDrag:r=!1,disableDragOnFocus:n=!0}=t,o=e=>{e.stopPropagation()};e.addEventListener("mouseover",o,{capture:!0});let i=()=>{setTimeout(()=>{e.addEventListener("pointerdown",o,{capture:!0})},200)},a=()=>{e.removeEventListener("pointerdown",o,{capture:!0})};return r?e.addEventListener("pointerdown",o,{capture:!0}):n&&(e.addEventListener("focus",i,{capture:!0}),e.addEventListener("blur",a,{capture:!0})),e.setAttribute("data-puck-overlay-portal","true"),()=>{e.removeEventListener("mouseover",o,{capture:!0}),r?e.removeEventListener("pointerdown",o,{capture:!0}):n&&(e.removeEventListener("focus",i,{capture:!0}),e.removeEventListener("blur",a,{capture:!0})),e.removeAttribute("data-puck-overlay-portal")}};(0,rF.init_react_import)();var u3=(0,rw.get_class_name_factory_default)("InlineTextField",{InlineTextField:"_InlineTextField_104qp_1"}),u6=(0,r_.memo)(({propPath:e,componentId:t,value:r,isReadOnly:n,opts:o={}})=>{var i;let a=(0,r_.useRef)(null),l=(0,rB.useAppStoreApi)(),s=null!=(i=o.disableLineBreaks)&&i;(0,r_.useEffect)(()=>{let n=l.getState(),o=n.state.indexes.nodes[t].data;if(!n.getComponentConfig(o.type))throw Error(`InlineTextField Error: No config defined for ${o.type}`);if(a.current){let n=null!=r?r:"";n!==a.current.innerText&&a.current.replaceChildren(n);let o=u4(a.current),i=r=>(0,rF.__async)(null,null,function*(){let n=l.getState().state.indexes.nodes[t],o=r.target.innerText;s&&(o=o.replaceAll(/\n/gm,""));let i=co(n.data.props,e,o);yield uL((0,rF.__spreadProps)((0,rF.__spreadValues)({},n.data),{props:i}),l.getState,"replace",!0)});return a.current.addEventListener("input",i),()=>{var e;null==(e=a.current)||e.removeEventListener("input",i),null==o||o()}}},[l,a.current,r,s]);let[c,u]=(0,r_.useState)(!1),[d,p]=(0,r_.useState)(!1);return(0,rV.jsx)("span",{className:u3(),ref:a,contentEditable:c||d?"plaintext-only":"false",onClick:e=>{e.preventDefault(),e.stopPropagation()},onClickCapture:e=>{e.preventDefault(),e.stopPropagation();let r=uN(l.getState().state,t);l.getState().setUi({itemSelector:r})},onKeyDown:e=>{e.stopPropagation(),(s&&"Enter"===e.key||n)&&e.preventDefault()},onKeyUp:e=>{e.stopPropagation(),e.preventDefault()},onMouseOverCapture:()=>u(!0),onMouseOutCapture:()=>u(!1),onFocus:()=>p(!0),onBlur:()=>p(!1)})});(0,rF.init_react_import)();var u5=(0,r_.lazy)(()=>e.A(167900).then(e=>({default:e.Editor}))),u8=(0,r_.lazy)(()=>e.A(302728).then(e=>({default:e.RichTextRender}))),u9=(0,r_.memo)(({value:e,componentId:t,propPath:r,field:n,id:o})=>{let i=(0,r_.useRef)(null),a=(0,rB.useAppStoreApi)();(0,r_.useEffect)(()=>{if(!i.current)return;let e=u4(i.current,{disableDragOnFocus:!0});return()=>null==e?void 0:e()},[i.current]);let l=(0,r_.useCallback)((e,n)=>(0,rF.__async)(null,null,function*(){let o=a.getState().state.indexes.nodes[t],i=co(o.data.props,r,e);yield uL((0,rF.__spreadProps)((0,rF.__spreadValues)({},o.data),{props:i}),a.getState,"replace",!0,n)}),[a,t,r]),s=(0,r_.useCallback)(e=>{a.setState({currentRichText:{inlineComponentId:t,inline:!0,field:n,editor:e,id:o}})},[n,t]);if(!n.contentEditable)return(0,rV.jsx)(r_.Suspense,{fallback:(0,rV.jsx)(rA,{content:e}),children:(0,rV.jsx)(u8,{content:e,field:n})});let c={content:e,onChange:l,field:n,inline:!0,onFocus:s,id:o,name:r};return(0,rV.jsx)("div",{ref:i,onClick:e=>{e.preventDefault(),e.stopPropagation()},onClickCapture:e=>{e.preventDefault(),e.stopPropagation();let r=uN(a.getState().state,t);a.getState().setUi({itemSelector:r})},children:(0,rV.jsx)(r_.Suspense,{fallback:(0,rV.jsx)(c9,(0,rF.__spreadValues)({},c)),children:(0,rV.jsx)(u5,(0,rF.__spreadValues)({},c))})})});u9.displayName="InlineEditorWrapper",(0,rF.init_react_import)(),(0,rF.init_react_import)();var u7=(0,r_.memo)(({Component:e,componentProps:t})=>(0,rV.jsx)(e,(0,rF.__spreadValues)({},t)),(e,t)=>{let r=!0;return"puck"in e.componentProps&&"puck"in t.componentProps&&(r=(0,sY.deepEqual)(e.componentProps.puck,t.componentProps.puck)),e.Component===t.Component&&function(e,t,r=[]){if(Object.is(e,t))return!0;if("object"!=typeof e||null===e||"object"!=typeof t||null===t||Object.getPrototypeOf(e)!==Object.getPrototypeOf(t))return!1;let n=new Set(r),o=Object.keys(e).filter(e=>!n.has(e)),i=Object.keys(t).filter(e=>!n.has(e));if(o.length!==i.length)return!1;for(let r=0;r<o.length;r++){let n=o[r];if(!Object.prototype.hasOwnProperty.call(t,n)||!Object.is(e[n],t[n]))return!1}return!0}(e.componentProps,t.componentProps,["puck"])&&r});(0,rF.init_react_import)();var de=new Map,dt=({contentIds:e,zoneCompound:t,renderItem:r})=>{let n=(0,rB.useAppStore)(e=>{var t,r;return null!=(r=null==(t=e.selectedItem)?void 0:t.props.id)?r:null}),o=uv(),i=(0,r_.useContext)(ud),a=ch(ud,e=>{var t;let r=null==(t=e.draggedItem)?void 0:t.id;return r?String(r):null}),l=ch(ud,e=>{var t,r,n;if(null==(t=e.draggedItem)?void 0:t.id){let[t]=null!=(n=Object.entries(null!=(r=e.previewIndex)?r:{}).find(([,e])=>!(null==e?void 0:e.ghost)))?n:[];return null==t?void 0:t.split(":")[0]}return null}),s=null==o?void 0:o.defaultView,c=(0,r_.useRef)(new Map),u=(0,rB.useAppStoreApi)(),d=(0,r_.useCallback)(t=>{var r,n,o,i;if(!t||"root"===t)return -1;let a=e.indexOf(t);if(a>-1)return a;let l=null!=(o=null==(n=null==(r=u.getState().state.indexes.nodes)?void 0:r[t])?void 0:n.path)?o:[];for(let t=l.length-1;t>=0;t-=1){let r=null==(i=l[t])?void 0:i.split(":")[0];if(!r||"root"===r)continue;let n=e.indexOf(r);if(n>-1)return n}return -1},[u,e]),p=(0,r_.useMemo)(()=>{let e=new Set;return[n,a,l].forEach(t=>{let r=d(t);r>-1&&e.add(r)}),Array.from(e).sort((e,t)=>e-t)},[l,a,d,n]),h=(0,r_.useCallback)(e=>{let t=s0(e);return p.forEach(e=>{t.includes(e)||t.push(e)}),t.sort((e,t)=>e-t),t},[p]),f=ct({count:e.length,getItemKey:t=>e[t],estimateSize:t=>{var r,n;return r=e[t],null!=(n=de.get(r))?n:320},getScrollElement:()=>null!=s?s:null,overscan:5,observeElementRect:(e,t)=>s?((e,t)=>{let r=e.scrollElement;if(!r)return;let n=()=>{t({width:r.innerWidth,height:r.innerHeight})};return n(),r.addEventListener("resize",n,s2),()=>{r.removeEventListener("resize",n)}})(e,t):s1(e,t),observeElementOffset:(e,t)=>s?s3(e,t,t=>e.options.horizontal?t.scrollX:t.scrollY):s6(e,t),scrollToFn:(e,t,r)=>s8(e,t,r),rangeExtractor:h,initialOffset:()=>s?s.scrollY:0});(0,r_.useEffect)(()=>(i.getState().registerRootVirtualizer(t,{resolveIndex:e=>d(e),virtualizer:f}),()=>{i.getState().unregisterRootVirtualizer(t)}),[d,f,t,i]);let v=(0,r_.useCallback)(e=>{let t=c.current.get(e);if(t)return t;let r=t=>{if(!t)return;let r=Math.ceil(t.getBoundingClientRect().height)||320;"number"==typeof r&&r>0&&(r<=0||de.set(e,r))};return c.current.set(e,r),r},[]);(0,r_.useEffect)(()=>{let t=new Set(e);Array.from(c.current.keys()).forEach(e=>{t.has(e)||c.current.delete(e)})},[e]);let g=f.getVirtualItems(),m=f.getTotalSize(),_=(0,r_.useMemo)(()=>{let t=[],n=0,o=-1;g.forEach(i=>{if(!i)return;let a=e[i.index],l=Math.max(i.start-n,0);l>0&&t.push((0,rV.jsx)("div",{style:{height:`${l}px`}},`gap:${o}:${i.index}`)),t.push(r({componentId:a,index:i.index,measureRef:v(a)})),n=i.end,o=i.index});let i=Math.max(m-n,0);return i>0&&t.push((0,rV.jsx)("div",{style:{height:`${i}px`}},`gap:${o}:end`)),t},[m,g,v]);return(0,rV.jsx)(rV.Fragment,{children:_})};(0,rF.init_react_import)();var dr=(0,rw.get_class_name_factory_default)("DropZone",uC),dn="var(--puck-line-placeholder-width, 2px)",di=({zoneRef:e,contentIds:t,index:r})=>{let[n,o]=(0,r_.useState)();return((0,r_.useLayoutEffect)(()=>{var n,i,a,l;let s,c=e.current,u=null==c?void 0:c.ownerDocument.defaultView;if(!c||!u)return;let d=e=>parseFloat(null!=e?e:"")||0,p=e=>{let r=t[e];if(void 0===r)return;let n=c.querySelector(`:scope > ${um(r)}:not([data-dnd-dragging])`);if(n)return{el:n,rect:n.getBoundingClientRect()}},h=c.getBoundingClientRect(),f=u.getComputedStyle(c),v=p(r-1),g=p(r),m=null!=g?g:v,{horizontal:_,reversed:b,forward:y,start:k,end:w,isBefore:S}=uW(u$(c,u,f)),I=d(_?f.columnGap:f.rowGap),j=(e,t)=>{var r;return d(null==(r=e?u.getComputedStyle(e):void 0)?void 0:r["start"===t==!b?_?"marginLeft":"marginTop":_?"marginRight":"marginBottom"])},z=d(f.borderLeftWidth),E=d(f.borderTopWidth),C=d(f.borderRightWidth),A=d(f.borderBottomWidth);s=g?v&&S(w(v.rect),k(g.rect))?(w(v.rect)+k(g.rect))/2:k(g.rect)-y*(Math.max(j(g.el,"start"),I)/2):v?w(v.rect)+y*(Math.max(j(v.el,"end"),I)/2):_?b?h.right-C-d(f.paddingRight):h.left+z+d(f.paddingLeft):b?h.bottom-A-d(f.paddingBottom):h.top+E+d(f.paddingTop),_?o({top:(null!=(n=null==m?void 0:m.rect.top)?n:h.top+E+d(f.paddingTop))-h.top+c.scrollTop-E,height:null!=(i=null==m?void 0:m.rect.height)?i:h.height-E-A-d(f.paddingTop)-d(f.paddingBottom),left:uF(s-h.left+c.scrollLeft-z,0,c.scrollWidth),width:dn,transform:"translateX(-50%)"}):o({left:(null!=(a=null==m?void 0:m.rect.left)?a:h.left+z+d(f.paddingLeft))-h.left+c.scrollLeft-z,width:null!=(l=null==m?void 0:m.rect.width)?l:h.width-z-C-d(f.paddingLeft)-d(f.paddingRight),top:uF(s-h.top+c.scrollTop-E,0,c.scrollHeight),height:dn,transform:"translateY(-50%)"})},[e,t,r]),n)?(0,rV.jsx)("div",{className:dr("linePlaceholder"),style:n,"data-puck-line-placeholder":!0}):null},da=(0,rw.get_class_name_factory_default)("DropZone",uC),dl=({element:e,label:t,override:r})=>e?(0,rV.jsx)("div",{dangerouslySetInnerHTML:{__html:e.outerHTML}}):(0,rV.jsx)(uJ,{name:t,children:r}),ds=e=>(0,rV.jsx)(du,(0,rF.__spreadValues)({},e)),dc=(0,r_.memo)(({zoneCompound:e,componentId:t,index:r,dragAxis:n,collisionAxis:o,inDroppableZone:i,itemRef:a})=>{var l,s,c,u;let d=(0,rB.useAppStore)(e=>e.metadata),p=(0,r_.useContext)(uu),{depth:h=1}=null!=p?p:{},f=(0,r_.useContext)(ud),v=(0,rB.useAppStore)(rW(e=>{var r;return null==(r=e.state.indexes.nodes[t])?void 0:r.flatData.props})),g=(0,rB.useAppStore)(e=>{var r;return null==(r=e.state.indexes.nodes[t])?void 0:r.data.type}),m=(0,rB.useAppStore)(rW(e=>{var r;return null==(r=e.state.indexes.nodes[t])?void 0:r.data.readOnly})),_=(0,rB.useAppStoreApi)(),b=(0,r_.useMemo)(()=>{if(v)return(0,rS.expandNode)({type:g,props:v});let r=f.getState().previewIndex[e];return t===(null==r?void 0:r.props.id)?{type:r.componentType,props:r.props,previewType:r.type,element:r.element}:null},[_,t,e,g,v]),y=(0,rB.useAppStore)(e=>(null==b?void 0:b.type)?e.config.components[b.type]:null),k=(0,r_.useMemo)(()=>({renderDropZone:ds,isEditing:!0,dragRef:null,metadata:(0,rF.__spreadValues)((0,rF.__spreadValues)({},d),null==y?void 0:y.metadata)}),[d,null==y?void 0:y.metadata]),w=(0,rB.useAppStore)(e=>e.overrides),S=(0,rB.useAppStore)(e=>{var r;return(null==(r=e.componentState[t])?void 0:r.loadingCount)>0}),I=(0,rB.useAppStore)(e=>{var r;return(null==(r=e.selectedItem)?void 0:r.props.id)===t}),j=(0,rB.useMessage)("label-component"),z=(0,rB.useMessage)("canvas-noconfig",{type:null!=(s=null==(l=null==b?void 0:b.type)?void 0:l.toString())?s:""}),E=null!=(u=null!=(c=null==y?void 0:y.label)?c:null==b?void 0:b.type.toString())?u:j,C=(0,r_.useMemo)(()=>(0,rF.__spreadProps)((0,rF.__spreadValues)((0,rF.__spreadValues)({},null==y?void 0:y.defaultProps),null==b?void 0:b.props),{puck:k,editMode:!0}),[null==y?void 0:y.defaultProps,null==b?void 0:b.props,k]),A=(0,r_.useMemo)(()=>{var e;return{type:null!=(e=null==b?void 0:b.type)?e:g,props:C}},[null==b?void 0:b.type,g,C]),P=(0,rB.useAppStore)(e=>e.config),M=(0,rB.useAppStore)(e=>e.plugins),O=(0,rB.useAppStore)(e=>e.fieldTransforms),D=u2(P,A,(0,r_.useMemo)(()=>(0,rF.__spreadValues)((0,rF.__spreadValues)((0,rF.__spreadValues)((0,rF.__spreadValues)((0,rF.__spreadValues)({},rj(ds,e=>(0,rV.jsx)(u1,{componentId:t,zone:e.zone}))),{text:({value:e,componentId:t,field:r,propPath:n,isReadOnly:o})=>r.contentEditable?(0,rV.jsx)(u6,{propPath:n,componentId:t,value:e,opts:{disableLineBreaks:!0},isReadOnly:o}):e,textarea:({value:e,componentId:t,field:r,propPath:n,isReadOnly:o})=>r.contentEditable?(0,rV.jsx)(u6,{propPath:n,componentId:t,value:e,isReadOnly:o}):e,custom:({value:e,componentId:t,field:r,propPath:n,isReadOnly:o})=>r.contentEditable&&"string"==typeof e?(0,rV.jsx)(u6,{propPath:n,componentId:t,value:e,isReadOnly:o}):e}),{richtext:({value:e,componentId:t,field:r,propPath:n,isReadOnly:o})=>{let{contentEditable:i=!0,tiptap:a}=r;if(!1===i||o)return(0,rV.jsx)(u8,{content:e,field:r});let l=`${t}_${r.type}_${n}`;return(0,rV.jsx)(u9,{value:e,componentId:t,propPath:n,field:r,id:l},l)}}),M.reduce((e,t)=>(0,rF.__spreadValues)((0,rF.__spreadValues)({},e),t.fieldTransforms),{})),O),[M,O]),m,S);if(!b)return;let T=y?y.render:()=>(0,rV.jsx)("div",{style:{padding:48,textAlign:"center"},children:z}),N=b.type,L="previewType"in b&&"insert"===b.previewType;return(0,rV.jsx)(uE,{id:t,componentType:N,zoneCompound:e,depth:h+1,index:r,isLoading:S,isSelected:I,label:E,autoDragAxis:n,userDragAxis:o,inDroppableZone:i,itemRef:a,children:e=>{var t;return(null==y?void 0:y.inline)&&!L?(0,rV.jsx)(u7,{Component:T,componentProps:(0,rF.__spreadProps)((0,rF.__spreadValues)({},D),{puck:(0,rF.__spreadProps)((0,rF.__spreadValues)({},D.puck),{dragRef:e})})}):(0,rV.jsx)("div",{ref:e,children:L?(0,rV.jsx)(dl,{label:E,override:null!=(t=w.componentItem)?t:w.drawerItem,element:"element"in b&&b.element?b.element:void 0}):(0,rV.jsx)(u7,{Component:T,componentProps:D})})}})}),du=(0,r_.forwardRef)(function({zone:e,allow:t,disallow:r,style:n,className:o,minEmptyHeight:i="128px",collisionAxis:a,as:l},s){let c=(0,r_.useContext)(uu),u=(0,rB.useAppStoreApi)(),{areaId:d,depth:p=0,registerLocalZone:h,unregisterLocalZone:f}=null!=c?c:{},v=(0,rB.useAppStore)(rW(e=>{var t;return d?null==(t=e.state.indexes.nodes[d])?void 0:t.path:null})),g=rS.rootDroppableId;d&&e!==rS.rootDroppableId&&(g=`${d}:${e}`);let m=g===rS.rootDroppableId||e===rS.rootDroppableId||"root"===d,_=ch(ud,e=>e.nextAreaDepthIndex[d||""]),b=(0,rB.useAppStore)(rW(e=>{var t;return null==(t=e.state.indexes.zones[g])?void 0:t.contentIds})),y=(0,rB.useAppStore)(rW(e=>{var t;return null==(t=e.state.indexes.zones[g])?void 0:t.type}));(0,r_.useEffect)(()=>{(!y||"dropzone"===y)&&(null==c?void 0:c.registerZone)&&(null==c||c.registerZone(g))},[y,u]),(0,r_.useEffect)(()=>{"dropzone"===y&&g!==rS.rootDroppableId&&console.warn("DropZones have been deprecated in favor of slot fields and will be removed in a future version of Puck. Please see the migration guide: https://www.puckeditor.com/docs/guides/migrations/dropzones-to-slots")},[y]);let k=(0,r_.useMemo)(()=>b||[],[b]),w=(0,r_.useRef)(null),S=(0,r_.useCallback)(e=>uA(e,{allow:t,disallow:r}),[t,r]),I=ch(ud,e=>{var t;return S(null==(t=e.draggedItem)?void 0:t.data.componentType)}),j=_||m,z=ch(ud,e=>{var t;let r=!0;return(r=null!=(t=e.zoneDepthIndex[g])&&t)&&(r=I),r});(0,r_.useEffect)(()=>(h&&h(g,I||z),()=>{f&&f(g)}),[I,z,g]);let[E,C]=((e,t)=>{var r,n;let o,i=(0,r_.useContext)(ud),a=ch(ud,e=>e.previewIndex[t]),l=(0,rB.useAppStore)(e=>e.state.ui.isDragging),[s,c]=(0,r_.useState)(e),[u,d]=(0,r_.useState)(a),p=(r=(e,t,r,n,o,i)=>{(!r||o)&&(t&&!t.linePlaceholder?c((0,rR.insert)(e.filter(e=>e!==t.props.id),t.index,t.props.id)):c(o&&!i?e.filter(e=>e!==n):e),d(t))},n=[],o=lV(),(0,r_.useCallback)((...e)=>(0,rF.__async)(null,null,function*(){return yield null==o?void 0:o.renderer.rendering,r(...e)}),[...n,o]));return(0,r_.useEffect)(()=>{var t;let r=i.getState(),n=null==(t=r.draggedItem)?void 0:t.id,o=Object.values(r.previewIndex||{});p(e,a,l,n,o.length>0,o.some(e=>null==e?void 0:e.linePlaceholder))},[e,a,l]),[s,u]})(k,g),A=C&&!C.linePlaceholder?1:0,P=E.length===A,M=z&&P,O=(0,r_.useContext)(ud);(0,r_.useEffect)(()=>{let{enabledIndex:e}=O.getState();O.setState({enabledIndex:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{[g]:z})})},[z,O,g]);let{ref:D}=l3({id:g,collisionPriority:z?p:0,disabled:!M,collisionDetector:cE,type:"dropzone",data:{areaId:d,depth:p,isDroppableTarget:I,path:v||[]}}),T=(0,rB.useAppStore)(e=>(null==e?void 0:e.selectedItem)&&d===(null==e?void 0:e.selectedItem.props.id)),[N]=((e,t)=>{let r=(0,rB.useAppStore)(e=>e.status),[n,o]=(0,r_.useState)(t||"y"),i=(0,r_.useCallback)(()=>{if(e.current){let t=window.getComputedStyle(e.current);"grid"===t.display?o("dynamic"):"flex"===t.display&&"row"===t.flexDirection?o("x"):o("y")}},[e.current]);return(0,r_.useEffect)(()=>{let e=()=>{i()};return window.addEventListener("viewportchange",e),()=>{window.removeEventListener("viewportchange",e)}},[]),(0,r_.useEffect)(i,[r,t]),[n,i]})(w,a),[L,B]=(({zoneCompound:e,userMinEmptyHeight:t,ref:r})=>{let n=(0,rB.useAppStoreApi)(),[o,i]=(0,r_.useState)(0),[a,l]=(0,r_.useState)(!1),{draggedItem:s,isZone:c}=ch(ud,t=>{var r,n;return{draggedItem:(null==(r=t.draggedItem)?void 0:r.data.zone)===e?t.draggedItem:null,isZone:(null==(n=t.draggedItem)?void 0:n.data.zone)===e}}),u=(0,r_.useRef)(0),d=uf(t=>{if(t){let t=u0(n,e);if(i(0),t||0===u.current)return void l(!1);let r=n.getState().selectedItem,o=n.getState().state.indexes.zones,a=n.getState().nodes;a.setOverlayVisible(null==r?void 0:r.props.id,!1),setTimeout(()=>{var t;let n=(null==(t=o[e])?void 0:t.contentIds)||[];a.syncNodes(n),r&&setTimeout(()=>{a.syncNode(r.props.id),a.setOverlayVisible(r.props.id,!0)},200),l(!1)},100)}},[n,o,e]);(0,r_.useEffect)(()=>{if(s&&r.current&&c){let t=r.current.getBoundingClientRect();return u.current=u0(n,e),i(t.height),l(!0),d()}},[r.current,s,d]);let p=isNaN(Number(t))?t:`${t}px`;return[o?`${o}px`:p,a]})({zoneCompound:g,userMinEmptyHeight:i,ref:w}),R=(0,r_.useCallback)(e=>{uS([w,D,s],e)},[D]),F=(0,rB.useAppStore)(e=>e._experimentalVirtualization),V=(null!=d?d:rS.rootAreaId)===rS.rootAreaId&&0===p;return(0,rV.jsxs)(null!=l?l:"div",{className:`${da({isRootZone:m,hoveringOverArea:j,isEnabled:z,isAreaSelected:T,hasChildren:k.length>0,isAnimating:B})}${o?` ${o}`:""}`,ref:R,"data-testid":`dropzone:${g}`,"data-puck-dropzone":g,style:(0,rF.__spreadProps)((0,rF.__spreadValues)({},n),{"--puck-slot-min-empty-height":L,backgroundColor:null==n?void 0:n.backgroundColor}),children:[F&&V?(0,rV.jsx)(dt,{contentIds:E,zoneCompound:g,renderItem:e=>(0,rV.jsx)(dc,{zoneCompound:g,componentId:e.componentId,dragAxis:N,index:e.index,collisionAxis:a,inDroppableZone:I,itemRef:e.measureRef},e.componentId)}):E.map((e,t)=>(0,rV.jsx)(dc,{zoneCompound:g,componentId:e,dragAxis:N,index:t,collisionAxis:a,inDroppableZone:I},e)),(null==C?void 0:C.linePlaceholder)&&(0,rV.jsx)(di,{zoneRef:w,contentIds:k,index:C.index})]})}),dd=({config:e,item:t,metadata:r})=>{let n=e.components[t.type],o=rE(e,t,t=>(0,rV.jsx)(rD,(0,rF.__spreadProps)((0,rF.__spreadValues)({},t),{config:e,metadata:r}))),i=(0,r_.useMemo)(()=>({areaId:o.id,depth:1}),[o]),a=rO(n.fields,o);return(0,rV.jsx)(uh,{value:i,children:(0,rV.jsx)(n.render,(0,rF.__spreadProps)((0,rF.__spreadValues)((0,rF.__spreadValues)({},o),a),{puck:(0,rF.__spreadProps)((0,rF.__spreadValues)({},o.puck),{renderDropZone:dp,metadata:(0,rF.__spreadValues)((0,rF.__spreadValues)({},r),n.metadata)})}))},o.id)},dp=e=>(0,rV.jsx)(dh,(0,rF.__spreadValues)({},e)),dh=(0,r_.forwardRef)(function({className:e,style:t,zone:r,as:n},o){let i=(0,r_.useContext)(uu),{areaId:a="root"}=i||{},{config:l,data:s,metadata:c}=(0,r_.useContext)(dg),u=`${a}:${r}`,d=(null==s?void 0:s.content)||[];return((0,r_.useEffect)(()=>{!d&&(null==i?void 0:i.registerZone)&&(null==i||i.registerZone(u))},[d]),s&&l)?(u!==rS.rootDroppableId&&(d=(0,rS.setupZone)(s,u).zones[u]),(0,rV.jsx)(null!=n?n:"div",{className:e,style:t,ref:o,children:d.map(e=>l.components[e.type]?(0,rV.jsx)(dd,{config:l,item:e,metadata:c},e.props.id):null)})):null}),df=e=>(0,rV.jsx)(dv,(0,rF.__spreadValues)({},e)),dv=(0,r_.forwardRef)(function(e,t){let r=(0,r_.useContext)(uu);return(null==r?void 0:r.mode)==="edit"?(0,rV.jsx)(rV.Fragment,{children:(0,rV.jsx)(du,(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{ref:t}))}):(0,rV.jsx)(rV.Fragment,{children:(0,rV.jsx)(dh,(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{ref:t}))})}),dg=r_.default.createContext({config:{components:{}},data:{root:{},content:[]},metadata:{}});function dm({config:e,data:t,metadata:r={}}){var n,o;let i=(0,rF.__spreadProps)((0,rF.__spreadValues)({},t),{root:t.root||{},content:t.content||[]}),a="props"in i.root?i.root.props:i.root,l=(null==a?void 0:a.title)||"",s=(0,rF.__spreadProps)((0,rF.__spreadValues)({},a),{puck:{renderDropZone:df,isEditing:!1,dragRef:null,metadata:r},title:l,editMode:!1,id:"puck-root"}),c=rE(e,{type:"root",props:s},t=>(0,rV.jsx)(rN,(0,rF.__spreadProps)((0,rF.__spreadValues)({},t),{config:e,metadata:r}))),u=rO(null==(n=e.root)?void 0:n.fields,s),d=(0,r_.useMemo)(()=>({mode:"render",depth:0}),[]);return(null==(o=e.root)?void 0:o.render)?(0,rV.jsx)(dg.Provider,{value:{config:e,data:i,metadata:r},children:(0,rV.jsx)(uh,{value:d,children:(0,rV.jsx)(e.root.render,(0,rF.__spreadProps)((0,rF.__spreadValues)((0,rF.__spreadValues)({},c),u),{children:(0,rV.jsx)(dp,{zone:rS.rootZone})}))})}):(0,rV.jsx)(dg.Provider,{value:{config:e,data:i,metadata:r},children:(0,rV.jsx)(uh,{value:d,children:(0,rV.jsx)(dp,{zone:rS.rootZone})})})}(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var d_=(e,t)=>{let r={back:e.history.back,forward:e.history.forward,setHistories:e.history.setHistories,setHistoryIndex:e.history.setHistoryIndex,hasPast:e.history.hasPast(),hasFuture:e.history.hasFuture(),histories:e.history.histories,index:e.history.index},n={appState:(0,rR.makeStatePublic)(e.state),config:e.config,dispatch:e.dispatch,getPermissions:e.permissions.getPermissions,refreshPermissions:e.permissions.refreshPermissions,resolveDataById:(e,r)=>(function(e,t,r){return(0,rF.__async)(this,null,function*(){let n=t().state.indexes.nodes[e];n?yield uL(n.data,t,r):console.warn(`Warning: Could not find component with id "${e}" to resolve its data. Component may have been removed or the id is invalid.`)})})(e,t,r),resolveDataBySelector:(e,r)=>(function(e,t,r){return(0,rF.__async)(this,null,function*(){let n=(0,rR.getItem)(e,t().state);if(!n)return void console.warn(`Warning: Could not find component for selector "${JSON.stringify(e)}" to resolve its data. Component may have been removed or the selector is invalid.`);let o=(0,rS.toComponent)(n);yield uL(o,t,r)})})(e,t,r),history:r,selectedItem:e.selectedItem||null,getItemBySelector:t=>(0,rR.getItem)(t,e.state),getItemById:t=>e.state.indexes.nodes[t].data,getSelectorForId:t=>uN(e.state,t),getParentById:t=>{let r=e.state.indexes.nodes[t].parentId;if(null===r)return;let n=e.state.indexes.nodes[r];if(n)return n.data},dictionary:e.dictionary};return n.__private={appState:e.state},n},db=(0,r_.createContext)(null),dx=e=>({state:e.state,config:e.config,dispatch:e.dispatch,permissions:e.permissions,history:e.history,selectedItem:e.selectedItem,dictionary:e.dictionary});(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var dy=(0,rw.get_class_name_factory_default)("ComponentList",{ComponentList:"_ComponentList_htktj_1","ComponentList--isExpanded":"_ComponentList--isExpanded_htktj_5","ComponentList-content":"_ComponentList-content_htktj_9","ComponentList-title":"_ComponentList-title_htktj_17","ComponentList-titleIcon":"_ComponentList-titleIcon_htktj_63"}),dk=({name:e,label:t})=>{var r;let n=(0,rB.useAppStore)(e=>e.overrides),o=(0,rB.useAppStore)(t=>t.permissions.getPermissions({type:e}).insert);return(0,r_.useEffect)(()=>{n.componentItem&&console.warn("The `componentItem` override has been deprecated and renamed to `drawerItem`")},[n]),(0,rV.jsx)(uQ.Item,{label:t,name:e,isDragDisabled:!o,children:null!=(r=n.componentItem)?r:n.drawerItem})},dw=({children:e,title:t,id:r})=>{let n=(0,rB.useAppStore)(e=>e.config),o=(0,rB.useAppStore)(e=>e.setUi),i=(0,rB.useAppStore)(e=>e.state.ui.componentList),{expanded:a=!0}=i[r]||{},l=`puck-drawer-category-${r}`,s=(0,rB.useMessage)("drawer-category-collapse",{title:null!=t?t:""}),c=(0,rB.useMessage)("drawer-category-expand",{title:null!=t?t:""});return(0,rV.jsxs)("div",{className:dy({isExpanded:a}),children:[t&&(0,rV.jsxs)("button",{type:"button",className:dy("title"),"aria-expanded":a,"aria-controls":l,onClick:()=>o({componentList:(0,rF.__spreadProps)((0,rF.__spreadValues)({},i),{[r]:(0,rF.__spreadProps)((0,rF.__spreadValues)({},i[r]),{expanded:!a})})}),title:a?s:c,children:[(0,rV.jsx)("div",{children:t}),(0,rV.jsx)("div",{className:dy("titleIcon"),children:a?(0,rV.jsx)(rB.ChevronUp,{size:12}):(0,rV.jsx)(rB.ChevronDown,{size:12})})]}),(0,rV.jsx)("div",{className:dy("content"),id:l,children:(0,rV.jsx)(uQ,{children:e||Object.keys(n.components).map(e=>{var t;return(0,rV.jsx)(dk,{label:null!=(t=n.components[e].label)?t:e,name:e},e)})})})]})};dw.Item=dk;var dS=()=>{let e=(0,rB.useAppStore)(e=>e.overrides),t=(()=>{let[e,t]=(0,r_.useState)(),r=(0,rB.useAppStore)(e=>e.config),n=(0,rB.useAppStore)(e=>e.state.ui.componentList),o=(0,rB.useMessage)("drawer-category-other");return(0,r_.useEffect)(()=>{var e,i,a;if(Object.keys(n).length>0){let l,s=[];l=Object.entries(n).map(([e,t])=>{var n,o;return t.components?(t.components.forEach(e=>{s.push(e)}),!1===t.visible)?null:(0,rV.jsx)(dw,{id:e,title:(null==(o=null==(n=r.categories)?void 0:n[e])?void 0:o.title)||t.title||e,children:t.components.map((e,t)=>{var n;let o=r.components[e]||{};return(0,rV.jsx)(dw.Item,{label:null!=(n=o.label)?n:e,name:e,index:t},e)})},e):null});let c=Object.keys(r.components).filter(e=>-1===s.indexOf(e));!(c.length>0)||(null==(e=n.other)?void 0:e.components)||(null==(i=n.other)?void 0:i.visible)===!1||l.push((0,rV.jsx)(dw,{id:"other",title:(null==(a=n.other)?void 0:a.title)||o,children:c.map((e,t)=>{var n;let o=r.components[e]||{};return(0,rV.jsx)(dw.Item,{name:e,label:null!=(n=o.label)?n:e,index:t},e)})},"other")),t(l)}},[r.categories,r.components,n,o]),e})(),r=(0,r_.useMemo)(()=>(e.components&&console.warn("The `components` override has been deprecated and renamed to `drawer`"),e.components||e.drawer||"div"),[e]);return(0,rV.jsx)(r,{children:t||(0,rV.jsx)(dw,{id:"all"})})};(0,rF.init_react_import)();var dI=(0,rw.get_class_name_factory_default)("BlocksPlugin",{BlocksPlugin:"_BlocksPlugin_9af19_1"});(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var dj=(e,t,r)=>{var n;let[o,i]=e.split(":");if(!i)return;let a=null==(n=r[o])?void 0:n.data.type,l=a&&a!==rS.rootAreaId?t.components[a]:t.root;return function(e,t){let r;if("string"!=typeof e)throw Error(`Can't get field definition for path (${e}): Path should be a string`);if(!t||"object"!=typeof t)return;let n=e.split(/\.|\[\d+\]/).filter(Boolean),o=t;for(let e=0;e<n.length;e++){if(r=o[n[e]],e===n.length-1)return r;if(!r||("object"!==r.type||!r.objectFields)&&("array"!==r.type||!r.arrayFields))return;"object"===r.type&&(o=r.objectFields),"array"===r.type&&(o=r.arrayFields)}}(i,null==l?void 0:l.fields)},dz={},dE="outline-item",dC=(e,t,r)=>{let n=e.get(t);if(void 0!==n)return n;let o=r();return e.set(t,o),o},dA=(e,t,r,n,o)=>dC(e,`zone:${t}`,()=>uA(r,((e,t,r)=>{var n;if((null==(n=r.zones[e])?void 0:n.type)!=="slot")return dz;let o=dj(e,t,r.nodes);return(null==o?void 0:o.type)!=="slot"?dz:{allow:o.allow,disallow:o.disallow}})(t,n,o))),dP=(e,t)=>r=>{let n,o,i,a;if(r.type!==dE)return!1;let l=r.data,s=e.outlineStore.getState().acceptCache,{config:c,state:u}=e.appStore.getState(),d=u.indexes,p="row"===t.kind?t.itemId:t.zoneCompound.split(":")[0];return n=l.itemId,o=d.nodes,!dC(s,`subtree:${p}`,()=>{var e;return p===n||((null==(e=o[p])?void 0:e.path)||[]).some(e=>e.split(":")[0]===n)})&&("zone"===t.kind?dA(s,t.zoneCompound,l.componentType,c,d):dA(s,t.zoneCompound,l.componentType,c,d)||(i=t.itemId,a=l.componentType,dC(s,`childZones:${i}`,()=>Object.keys(d.zones).some(e=>e.startsWith(`${i}:`)&&dA(s,e,a,c,d)))))};(0,rF.init_react_import)();var dM=()=>{let e=null,t=null,r=()=>{null!==e&&(clearTimeout(e),e=null),t=null};return(0,rH.createStore)((n,o)=>({status:"idle",draggedRow:null,tempExpandedIds:new Set,expandCandidateId:null,indicator:null,drop:null,acceptCache:new Map,startDrag:e=>n({status:"dragging",draggedRow:e,acceptCache:new Map}),setTarget:(e,t)=>{var r,i,a,l;let s=o();((null==(r=s.indicator)?void 0:r.targetId)!==e.targetId||(null==(i=s.indicator)?void 0:i.position)!==e.position||(null==(a=s.drop)?void 0:a.zone)!==t.zone||(null==(l=s.drop)?void 0:l.index)!==t.index)&&n({indicator:e,drop:t})},clearTarget:()=>{(null!==o().indicator||null!==o().drop)&&n({indicator:null,drop:null})},scheduleExpand:(i,a)=>{t===i||o().tempExpandedIds.has(i)||(r(),t=i,n({expandCandidateId:i}),e=setTimeout(()=>{e=null,t=null,n(e=>({tempExpandedIds:new Set(e.tempExpandedIds).add(i),expandCandidateId:null})),a()},600))},cancelPendingExpand:()=>{r(),null!==o().expandCandidateId&&n({expandCandidateId:null})},endDrag:()=>{r(),n({status:"dropping",indicator:null,drop:null,expandCandidateId:null})},reset:()=>{r(),n({status:"idle",draggedRow:null,tempExpandedIds:new Set,expandCandidateId:null,indicator:null,drop:null,acceptCache:new Map})}}))},dO=(0,r_.createContext)(dM()),dD=()=>(0,r_.useContext)(dO),dT=({kind:e,zoneCompound:t})=>{let r=(0,rB.useAppStoreApi)(),n=dD(),o=`${e}:${t}`,{ref:i}=l3({id:o,type:"outline-zone",accept:(0,r_.useMemo)(()=>dP({appStore:r,outlineStore:n},{kind:"zone",zoneCompound:t}),[r,n,t]),collisionDetector:cE,data:{kind:"zone",zoneCompound:t}}),a=ch(dO,e=>{var t;return(null==(t=e.indicator)?void 0:t.targetId)===o});return(0,r_.useMemo)(()=>({isDropTarget:a,ref:i}),[a,i])};(0,rF.init_react_import)(),(0,rF.init_react_import)();var dN=(0,rw.get_class_name_factory_default)("DropLine",{DropLine:"_DropLine_eyz3q_2","DropLine--top":"_DropLine--top_eyz3q_12","DropLine--bottom":"_DropLine--bottom_eyz3q_16","DropLine--outset":"_DropLine--outset_eyz3q_20"}),dL=({edge:e,outset:t})=>(0,rV.jsx)("div",{className:dN({top:"top"===e,bottom:"bottom"===e,outset:!!t})});(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var dB=(...e)=>[...e].filter(Boolean).join(" ");(0,rF.init_react_import)();var dR=(0,rw.get_class_name_factory_default)("LayerTree",{"LayerTree-helper":"_LayerTree-helper_1m7e4_2","LayerTree-helperRoot":"_LayerTree-helperRoot_1m7e4_11"}),dF=({zoneCompound:e})=>{let{ref:t,isDropTarget:r}=dT({kind:"empty",zoneCompound:e}),n=(0,rB.useMessage)("outline-empty"),[o]=e.split(":"),i=o===rS.rootAreaId;return(0,rV.jsxs)("li",{className:dB(dR("helper"),i?dR("helperRoot"):void 0),"data-puck-drop-target":r||void 0,ref:t,children:[n,r&&(0,rV.jsx)(dL,{edge:"top"})]})};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var dV=(0,rw.get_class_name_factory_default)("LayerActions",{LayerActions:"_LayerActions_d90t9_2","LayerActions--visible":"_LayerActions--visible_d90t9_18"}),d$=({node:e,visible:t})=>{let r=(0,rB.useAppStore)(e=>e.dispatch),n=dD(),o=(0,rB.useAppStore)(rW(t=>{let r=(0,rR.getItem)({index:e.index,zone:e.zoneCompound},t.state),n=t.permissions.getPermissions({item:r});return{delete:n.delete,duplicate:n.duplicate}})),i=(0,rB.useMessage)("outline-item-duplicate"),a=(0,rB.useMessage)("outline-item-delete"),l=(0,r_.useCallback)(t=>{t.stopPropagation(),"idle"===n.getState().status&&r({type:"remove",index:e.index,zone:e.zoneCompound})},[r,n,e]),s=(0,r_.useCallback)(t=>{t.stopPropagation(),"idle"===n.getState().status&&r({type:"duplicate",sourceIndex:e.index,sourceZone:e.zoneCompound})},[r,n,e.index,e.zoneCompound]);return o.delete||o.duplicate?(0,rV.jsxs)("div",{className:dV({visible:t}),children:[o.duplicate&&(0,rV.jsx)(rB.IconButton,{onClick:s,title:i,type:"button",children:(0,rV.jsx)(rB.Copy,{})}),o.delete&&(0,rV.jsx)(rB.IconButton,{onClick:l,title:a,type:"button",children:(0,rV.jsx)(rB.Trash,{})})]}):null},dW=(0,rw.get_class_name_factory_default)("Layer",{Layer:"_Layer_onfgu_1","Layer-inner":"_Layer-inner_onfgu_8","Layer--isSortable":"_Layer--isSortable_onfgu_18","Layer-content":"_Layer-content_onfgu_22","Layer-clickable":"_Layer-clickable_onfgu_29","Layer-caret":"_Layer-caret_onfgu_57","Layer--containsZone":"_Layer--containsZone_onfgu_68","Layer-title":"_Layer-title_onfgu_76","Layer-name":"_Layer-name_onfgu_85","Layer-icon":"_Layer-icon_onfgu_91","Layer-zones":"_Layer-zones_onfgu_101","Layer--isExpanded":"_Layer--isExpanded_onfgu_106","Layer--isSelected":"_Layer--isSelected_onfgu_115","Layer--isExpandCandidate":"_Layer--isExpandCandidate_onfgu_138","Layer--isDragSource":"_Layer--isDragSource_onfgu_143"}),dH=(0,r_.forwardRef)(function({dataIndex:e,depth:t,isSelected:r,node:n,selectedId:o},i){let a=(0,rB.useAppStore)(e=>e.dispatch),l=(0,rB.useAppStore)(e=>{var t,r;return null!=(r=null==(t=e.state.ui.itemExpanded)?void 0:t[n.itemId])&&r}),s=ch(ud,e=>e.hoveringComponent===n.itemId),c=(0,rB.useAppStore)(e=>{var t;let r=(0,rR.getItem)({index:n.index,zone:n.zoneCompound},e.state);return null==(t=e.permissions.getPermissions({item:r}))?void 0:t.drag}),{indicatorPosition:u,isDragSource:d,isExpandCandidate:p,isTempExpanded:h,rowRef:f}=(({componentType:e,index:t,itemId:r,zoneCompound:n})=>{let o=(0,rB.useAppStoreApi)(),i=dD(),a=(0,r_.useMemo)(()=>dP({appStore:o,outlineStore:i},{kind:"row",itemId:r,zoneCompound:n}),[o,i,r,n]),{handleRef:l,ref:s,isDragSource:c}=sq({id:r,index:t,group:n,type:dE,accept:a,data:{kind:"row",itemId:r,zoneCompound:n,index:t,componentType:e},collisionPriority:1,collisionDetector:(0,r_.useMemo)(()=>cP("y"),[]),transition:{duration:0},plugins:e=>[...e,aQ.configure({feedback:"clone",dropAnimation:null})]}),{indicatorPosition:u,isExpandCandidate:d,isTempExpanded:p}=ch(dO,e=>{var t;return{indicatorPosition:(null==(t=e.indicator)?void 0:t.targetId)===r?e.indicator.position:null,isExpandCandidate:e.expandCandidateId===r,isTempExpanded:e.tempExpandedIds.has(r)}});return{rowRef:(0,r_.useCallback)(e=>{s(e),l(e)},[s,l]),isDragSource:c,indicatorPosition:u,isExpandCandidate:d,isTempExpanded:p}})({componentType:n.componentType,index:n.index,itemId:n.itemId,zoneCompound:n.zoneCompound}),v=(0,r_.useContext)(ud),g=dD(),m=(0,rB.useMessage)("outline-item-collapse"),_=(0,rB.useMessage)("outline-item-expand"),b=n.childZones.length>0,y=(0,r_.useCallback)(e=>{a({type:"setUi",ui:{itemSelector:e}})},[a]),k=l||h,w=1!==n.childZones.length;return(0,rV.jsxs)("li",{ref:i,className:dW({containsZone:b,isDragSource:d,isExpandCandidate:p,isExpanded:k,isHovering:s,isSelected:r,isSortable:c}),"data-index":e,"data-puck-layer-tree-id":n.itemId,children:[null!==u&&(0,rV.jsx)(dL,{edge:"before"===u?"top":"bottom",outset:!0}),(0,rV.jsxs)("div",{className:dW("inner"),ref:f,onMouseEnter:e=>{e.stopPropagation(),"idle"===g.getState().status&&v.setState({hoveringComponent:n.itemId})},onMouseLeave:e=>{e.stopPropagation(),v.setState({hoveringComponent:null})},children:[(0,rV.jsx)("div",{className:dW("caret"),children:(0,rV.jsx)(rB.IconButton,{onClick:e=>{e.stopPropagation(),"idle"===g.getState().status&&a({type:"setUi",ui:e=>{var t;let r=(0,rF.__spreadValues)({},e.itemExpanded);return(null==(t=e.itemExpanded)?void 0:t[n.itemId])?delete r[n.itemId]:r[n.itemId]=!0,{itemExpanded:r}},recordHistory:!1})},title:l?m:_,type:"button",children:(0,rV.jsx)(rB.ChevronRight,{})})}),(0,rV.jsxs)("div",{className:dW("content"),children:[(0,rV.jsx)("button",{type:"button",className:dW("clickable"),onClick:()=>{"idle"===g.getState().status&&(y({index:n.index,zone:n.zoneCompound}),v.getState().scrollToComponent(n.itemId))},children:(0,rV.jsxs)("div",{className:dW("title"),children:[(0,rV.jsx)("div",{className:dW("icon"),children:"Text"===n.componentType||"Heading"===n.componentType?(0,rV.jsx)(rB.Type,{}):(0,rV.jsx)(rB.LayoutGrid,{})}),(0,rV.jsx)("div",{className:dW("name"),children:n.label})]})}),(0,rV.jsx)(d$,{node:n,visible:s&&!d})]})]}),b&&k&&n.childZones.map(e=>(0,rV.jsx)("div",{className:dW("zones"),children:(0,rV.jsx)(dQ,{depth:w?t+1:t,selectedId:o,tree:w?e:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{label:void 0})})},e.zoneCompound))]})});(0,rF.init_react_import)();var dq={LayerTree:"_LayerTree_o5tyt_1","LayerTree--nested":"_LayerTree--nested_o5tyt_12"},dU=(0,rw.get_class_name_factory_default)("LayerTree",dq),dZ=({depth:e,selectedId:t,tree:r})=>(0,rV.jsxs)("ul",{className:dU({nested:e>0}),children:[0===r.items.length&&(0,rV.jsx)(dF,{zoneCompound:r.zoneCompound}),r.items.map(r=>(0,rV.jsx)(dH,{depth:e,isSelected:t===r.itemId,node:r,selectedId:t},r.itemId))]});(0,rF.init_react_import)();var dY=(0,rw.get_class_name_factory_default)("LayerTree",dq),dX=new Map,dK=({depth:e,selectedId:t,tree:r})=>{let n=(0,r_.useRef)(null),o=ch(dO,e=>{var t;return(null==(t=e.draggedRow)?void 0:t.zoneCompound)===r.zoneCompound?e.draggedRow.index:null}),i=(0,r_.useCallback)(e=>{let t=s0(e);return null===o||t.includes(o)||(t.push(o),t.sort((e,t)=>e-t)),t},[o]),a=ct({count:r.items.length,estimateSize:e=>{var t,n;return t=r.items[e].itemId,null!=(n=dX.get(t))?n:32},getItemKey:e=>r.items[e].itemId,getScrollElement:()=>(e=>{var t;let r=null!=(t=null==e?void 0:e.parentElement)?t:null;for(;r;){let{overflow:e,overflowY:t}=getComputedStyle(r);if([e,t].some(e=>/auto|scroll/.test(e)))return r;r=r.parentElement}return null})(n.current),overscan:8,rangeExtractor:i,measureElement:e=>{let t=Math.ceil(e.getBoundingClientRect().height),r=e.dataset.puckLayerTreeId;return r&&(t<=0||dX.set(r,t)),t||32}}),l=a.getVirtualItems(),s=a.getTotalSize(),c=[],u=0,d=-1;l.forEach(n=>{let o=r.items[n.index],i=Math.max(n.start-u,0);i>0&&c.push((0,rV.jsx)("li",{"aria-hidden":"true",style:{height:`${i}px`}},`gap:${r.zoneCompound}:${d}:${n.index}`)),c.push((0,rV.jsx)(dH,{dataIndex:n.index,depth:e,isSelected:t===o.itemId,node:o,ref:a.measureElement,selectedId:t},o.itemId)),u=n.end,d=n.index});let p=Math.max(s-u,0);return p>0&&c.push((0,rV.jsx)("li",{"aria-hidden":"true",style:{height:`${p}px`}},`gap:${r.zoneCompound}:${d}:end`)),(0,rV.jsxs)("ul",{className:dY({nested:e>0}),ref:n,children:[0===r.items.length&&(0,rV.jsx)(dF,{zoneCompound:r.zoneCompound}),c]})};(0,rF.init_react_import)();var dJ=(0,rw.get_class_name_factory_default)("LayerTree",{"LayerTree-zoneTitle":"_LayerTree-zoneTitle_fvhlh_2","LayerTree-zoneIcon":"_LayerTree-zoneIcon_fvhlh_19"}),dG=({label:e,zoneCompound:t})=>{let{ref:r,isDropTarget:n}=dT({kind:"label",zoneCompound:t});return(0,rV.jsxs)("div",{className:dJ("zoneTitle"),"data-puck-drop-target":n||void 0,ref:r,children:[(0,rV.jsx)("div",{className:dJ("zoneIcon"),children:(0,rV.jsx)(rB.Layers,{})}),e,n&&(0,rV.jsx)(dL,{edge:"bottom"})]})},dQ=({depth:e,selectedId:t,tree:r})=>{let n=0===e&&r.items.length>=25;return(0,rV.jsxs)(rV.Fragment,{children:[r.label&&(0,rV.jsx)(dG,{label:r.label,zoneCompound:r.zoneCompound}),n?(0,rV.jsx)(dK,{depth:e,selectedId:t,tree:r}):(0,rV.jsx)(dZ,{depth:e,selectedId:t,tree:r})]})};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var d0=e=>{if("u"<typeof document)return;let t=document.getElementById("preview-frame");e?null==t||t.setAttribute("data-puck-outline-dragging","true"):null==t||t.removeAttribute("data-puck-outline-dragging")},d1=(e,t,r)=>{var n,o,i;let a=r.outlineDndStore.getState(),l=a.draggedRow;if(!l)return;let s=e.operation.target;if(!s){a.cancelPendingExpand(),a.clearTarget();return}let c=s.data;if("zone"===c.kind){a.cancelPendingExpand(),a.setTarget({targetId:s.id.toString(),position:"inside"},{zone:c.zoneCompound,index:0});return}let{config:u,state:d}=r.appStore.getState(),p=d.indexes;if(dA(a.acceptCache,c.zoneCompound,l.componentType,u,p)){let e=null==(n=t.collisionObserver.collisions[0])?void 0:n.data,r=cM(null==e?void 0:e.direction);a.setTarget({targetId:s.id.toString(),position:r},{zone:c.zoneCompound,index:cO({position:r,sourceIndex:l.index,targetIndex:c.index,isSameZone:c.zoneCompound===l.zoneCompound})})}else a.clearTarget();let h=!!(null==(o=d.ui.itemExpanded)?void 0:o[c.itemId])||a.tempExpandedIds.has(c.itemId),f=(i=c.itemId,Object.keys(p.zones).some(e=>e.startsWith(`${i}:`)));!h&&f?a.scheduleExpand(c.itemId,()=>{requestAnimationFrame(()=>t.collisionObserver.forceUpdate(!0))}):a.cancelPendingExpand()},d2=[],d4=({children:e})=>{let t=(0,rB.useAppStoreApi)(),r=(0,r_.useContext)(ud),[n]=(0,r_.useState)(()=>dM()),o=(0,rB.useAppStore)(e=>{var t,r;return null!=(r=null==(t=e.dnd)?void 0:t.disableOutlineDrag)&&r}),i=cw({mouse:[new ls.Distance({value:5})]}),a=(0,r_.useMemo)(()=>({outlineDndStore:n,appStore:t,scrollToComponent:e=>r.getState().scrollToComponent(e)}),[n,t,r]);return(0,rV.jsx)(dO.Provider,{value:n,children:(0,rV.jsx)(lF,{sensors:o?d2:i,onBeforeDragStart:e=>{((e,t)=>{let r=e.operation.source,n=null==r?void 0:r.data;if(!r||!n)return;let o=t.appStore.getState(),i=(0,rR.getItem)({zone:n.zoneCompound,index:n.index},o.state);i&&o.permissions.getPermissions({item:i}).drag?(t.outlineDndStore.getState().startDrag({itemId:n.itemId,zoneCompound:n.zoneCompound,index:n.index,componentType:n.componentType}),d0(!0),o.dispatch({type:"setUi",ui:{isDragging:!0},recordHistory:!1})):e.preventDefault()})(e,a)},onDragOver:(e,t)=>{e.preventDefault(),d1(e,t,a)},onDragMove:(e,t)=>{d1(e,t,a)},onDragEnd:e=>{((e,t)=>{let{source:r}=e.operation,n=t.outlineDndStore.getState(),o=n.draggedRow,i=e.canceled?null:n.drop,a=t.appStore.getState().dispatch;if(d0(!1),o&&i){var l,s;let e,r,n,c;uB(o.itemId,{zone:o.zoneCompound,index:o.index},{zone:i.zone,index:i.index},t.appStore);let u=i.zone!==o.zoneCompound||i.index!==o.index;a({type:"setUi",ui:{itemSelector:{zone:i.zone,index:i.index},isDragging:!1},recordHistory:u}),l=o.itemId,s=t.scrollToComponent,r=0,n=0,c=()=>{var t;let o=null==(t=uv())?void 0:t.querySelector(`[data-puck-component="${l}"]`),i=o?o.getBoundingClientRect().top:null;(r=i===e?r+1:0,e=i,n+=1,r>=2||n>=60)?s(l):requestAnimationFrame(c)},requestAnimationFrame(c)}else a({type:"setUi",ui:{isDragging:!1},recordHistory:!1});n.endDrag();let c=()=>t.outlineDndStore.getState().reset();if(r&&"idle"!==r.status){let e=nl(()=>{"idle"===r.status&&(c(),null==e||e())})}else c()})(e,a)},children:e})})};(0,rF.init_react_import)(),(0,rF.init_react_import)();var d3=e=>{let t={};return Object.keys(e).forEach(e=>{let[r]=e.split(":");r&&(t[r]||(t[r]=[]),t[r].push(e))}),t},d6=({config:e,label:t,nodes:r,zoneCompound:n,zones:o,zonesByParent:i=d3(o),componentFallbackLabel:a})=>{var l,s;return{items:(null!=(s=null==(l=o[n])?void 0:l.contentIds)?s:[]).map((t,a)=>(({config:e,itemId:t,index:r,nodes:n,zoneCompound:o,zones:i,zonesByParent:a,componentFallbackLabel:l})=>{var s,c,u,d;let p=n[t],h=null!=(c=null==(s=null==p?void 0:p.data.type)?void 0:s.toString())?c:l,f=null!=(d=null==(u=e.components[h])?void 0:u.label)?d:h;return{childZones:(a[t]||[]).map(t=>d6({config:e,nodes:n,zoneCompound:t,zones:i,zonesByParent:a})),componentType:h,index:r,itemId:t,label:f,zoneCompound:o}})({config:e,itemId:t,index:a,nodes:r,zoneCompound:n,zones:o,zonesByParent:i})),label:((e,t,r,n)=>{var o,i;if(void 0!==n)return n;let[,a]=e.split(":");if(a)return null!=(i=null==(o=dj(e,r,t))?void 0:o.label)?i:a})(n,r,e,t),zoneCompound:n}},d5=(0,rw.get_class_name_factory_default)("LayerTreeRoot",{LayerTreeRoot:"_LayerTreeRoot_1qowl_1"}),d8=({selectedId:e,trees:t})=>{let r=(0,rB.useAppStore)(e=>{var t,r;return null!=(r=null==(t=e.dnd)?void 0:t.disableOutlineDrag)&&r});return(0,rV.jsx)(d4,{children:(0,rV.jsx)("div",{className:d5(),"data-puck-dnd-disabled":r||void 0,children:t.map(t=>(0,rV.jsx)(dQ,{depth:0,selectedId:e,tree:t},t.zoneCompound))})})};(0,rF.init_react_import)(),(0,rF.init_react_import)();var d9=(0,rw.get_class_name_factory_default)("CollapseAll",{CollapseAll:"_CollapseAll_1r4cy_1","CollapseAll-icon":"_CollapseAll-icon_1r4cy_5","CollapseAll--visible":"_CollapseAll--visible_1r4cy_10"}),d7=function({className:e}){let t=(0,rB.useAppStore)(e=>{var t;return Object.keys(null!=(t=e.state.ui.itemExpanded)?t:{}).length>0}),r=(0,rB.useAppStore)(e=>e.dispatch),n=(0,rB.useMessage)("outline-header-collapseall");return(0,rV.jsx)("div",{className:dB(d9({visible:t}),e),children:(0,rV.jsx)(rB.IconButton,{title:n,onClick:()=>{r({type:"setUi",ui:{itemExpanded:{}}})},children:(0,rV.jsx)(rB.ChevronsDownUp,{className:d9("icon")})})})};(0,rF.init_react_import)(),(0,rF.init_react_import)();var pe=(0,rw.get_class_name_factory_default)("OutlineHeader",{OutlineHeader:"_OutlineHeader_ntv8r_1"}),pt=({children:e,title:t})=>{let r=(0,rB.useMessage)("outline-header-title");return(0,rV.jsxs)("div",{className:pe(),children:[(0,rV.jsx)(cQ,{rank:"2",size:"xs",children:null!=r?r:t}),e]})};(0,rF.init_react_import)();var pr=(0,rw.get_class_name_factory_default)("OutlineWrapper",{OutlineWrapper:"_OutlineWrapper_b9ln0_1","OutlineWrapper-collapseAll":"_OutlineWrapper-collapseAll_b9ln0_9","OutlineWrapper-layers":"_OutlineWrapper-layers_b9ln0_15"}),pn=({children:e})=>(0,rV.jsx)("div",{className:pr(),children:e}),po=()=>{let e=(0,rB.useAppStore)(e=>e.overrides.outline),t=(0,rB.useAppStore)(e=>e.config),r=(0,rB.useAppStore)(e=>e.state.indexes.nodes),n=(0,rB.useAppStore)(e=>e.state.indexes.zones),o=(0,rB.useAppStore)(e=>{var t;return(null==(t=e.selectedItem)?void 0:t.props.id)||null}),i=(0,rB.useMessage)("label-component"),a=(0,rB.useAppStore)(rW(e=>Object.keys(e.state.indexes.zones).filter(e=>"root"===e.split(":")[0]))),l=(0,r_.useMemo)(()=>a.map(e=>d6({config:t,label:1===a.length?"":e.split(":")[1],nodes:r,zoneCompound:e,zones:n,componentFallbackLabel:i})),[t,r,a,n,i]),s=(0,r_.useMemo)(()=>e||pn,[e]);return(0,rV.jsxs)(s,{children:[(0,rV.jsx)(pt,{children:(0,rV.jsx)(d7,{className:pr("collapseAll")})}),(0,rV.jsx)("div",{className:pr("layers"),children:(0,rV.jsx)(d8,{selectedId:o,trees:l})})]})};(0,rF.init_react_import)();var pi=(0,rw.get_class_name_factory_default)("OutlinePlugin",{OutlinePlugin:"_OutlinePlugin_1ylsc_1"});(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var pa=(0,rw.get_class_name_factory_default)("Breadcrumbs",{Breadcrumbs:"_Breadcrumbs_8c6w5_1","Breadcrumbs-breadcrumbLabel":"_Breadcrumbs-breadcrumbLabel_8c6w5_7","Breadcrumbs-breadcrumb":"_Breadcrumbs-breadcrumb_8c6w5_7"}),pl=({children:e,numParents:t=1})=>{let r,n,o,i,a,l,s=(0,rB.useAppStore)(e=>e.setUi),c=(r=(0,rB.useAppStore)(e=>{var t;return null==(t=e.selectedItem)?void 0:t.props.id}),n=(0,rB.useAppStore)(e=>e.config),o=(0,rB.useAppStore)(e=>{var t;return null==(t=e.state.indexes.nodes[r])?void 0:t.path}),i=(0,rB.useAppStoreApi)(),a=(0,rB.useMessage)("label-page"),l=(0,rB.useMessage)("label-component"),(0,r_.useMemo)(()=>{let e=(null==o?void 0:o.map(e=>{var t,r,o,s;let[c]=e.split(":");if("root"===c)return{label:(null==(t=null==n?void 0:n.root)?void 0:t.label)||a,selector:null};let u=i.getState().state.indexes.nodes[c],d=u.path[u.path.length-1],p=((null==(r=i.getState().state.indexes.zones[d])?void 0:r.contentIds)||[]).indexOf(c);return{label:u?null!=(s=null==(o=n.components[u.data.type])?void 0:o.label)?s:u.data.type:l,selector:u?{index:p,zone:u.path[u.path.length-1]}:null}}))||[];return t?e.slice(e.length-t):e},[o,t,a,l]));return(0,rV.jsxs)("div",{className:pa(),children:[c.map((e,t)=>(0,rV.jsxs)("div",{className:pa("breadcrumb"),children:[(0,rV.jsx)("button",{type:"button",className:pa("breadcrumbLabel"),onClick:()=>s({itemSelector:e.selector}),children:e.label}),(0,rV.jsx)(rB.ChevronRight,{size:16})]},t)),e]})};(0,rF.init_react_import)(),(0,rF.init_react_import)();var ps=(0,rw.get_class_name_factory_default)("PuckFields",{PuckFields:"_PuckFields_wnj25_1","PuckFields--isLoading":"_PuckFields--isLoading_wnj25_6","PuckFields-loadingOverlay":"_PuckFields-loadingOverlay_wnj25_10","PuckFields-loadingOverlayInner":"_PuckFields-loadingOverlayInner_wnj25_25","PuckFields-field":"_PuckFields-field_wnj25_32","PuckFields--wrapFields":"_PuckFields--wrapFields_wnj25_36"}),pc=({children:e})=>(0,rV.jsx)(rV.Fragment,{children:e}),pu=({fieldName:e})=>{let t=(0,rB.useAppStore)(t=>t.fields.fields[e]),r=(0,rB.useAppStore)(t=>((t.selectedItem?t.selectedItem.readOnly:t.state.data.root.readOnly)||{})[e]),n=(0,rB.useAppStore)(r=>t?r.selectedItem?`${r.selectedItem.props.id}_${t.type}_${e}`:`root_${t.type}_${e}`:null),o=(0,rB.useAppStore)(rW(e=>{let{selectedItem:t,permissions:r}=e;return t?r.getPermissions({item:t}):r.getPermissions({root:!0})})),i=(0,rB.useAppStoreApi)(),a=(0,r_.useCallback)((t,r)=>(0,rF.__async)(null,null,function*(){let{dispatch:n,state:o,selectedItem:a,resolveComponentData:l}=i.getState(),{data:s,ui:c}=o,{itemSelector:u}=c,d=s.root.props||s.root,p=a?a.props:d,h=(0,rF.__spreadProps)((0,rF.__spreadValues)({},p),{[e]:t});if(a&&u){let e=yield l((0,rF.__spreadProps)((0,rF.__spreadValues)({},a),{props:h}),"replace"),t=uN(i.getState().state,a.props.id);if(!t)return;n({type:"replace",destinationIndex:t.index,destinationZone:t.zone||rS.rootDroppableId,data:e.node,ui:r});return}n(s.root.props?{type:"replaceRoot",root:(yield l((0,rF.__spreadProps)((0,rF.__spreadValues)({},s.root),{props:h}),"replace")).node,ui:(0,rF.__spreadValues)((0,rF.__spreadValues)({},c),r),recordHistory:!0}:{type:"setData",data:{root:h}})}),[e]),{visible:l=!0}=null!=t?t:{},s=(0,r_.useContext)(cf.ctx);return((0,r_.useEffect)(()=>i.subscribe(t=>{var r;return null==(r=t.getCurrentData().props)?void 0:r[e]},t=>{s.setState({[e]:t})}),[i,s]),t&&n&&l&&"slot"!==t.type)?(0,rV.jsx)("div",{className:ps("field"),children:(0,rV.jsx)(ua,{field:t,name:e,id:n,readOnly:!o.edit||r,onChange:a})},n):null},pd=(0,r_.memo)(({fieldName:e})=>{let t=(0,rB.useAppStoreApi)(),r=(0,r_.useMemo)(()=>{var r;let n=null==(r=t.getState().getCurrentData().props)?void 0:r[e];return{[e]:n}},[]);return(0,rV.jsx)(cf.Provider,{value:r,children:(0,rV.jsx)(pu,{fieldName:e})})}),pp=(0,r_.memo)(({wrapFields:e=!0})=>{let t=(0,rB.useAppStore)(e=>e.overrides),r=(0,rB.useAppStore)(e=>{var t,r;let n=e.selectedItem?null==(t=e.componentState[e.selectedItem.props.id])?void 0:t.loadingCount:null==(r=e.componentState.root)?void 0:r.loadingCount;return(null!=n?n:0)>0}),n=(0,rB.useAppStore)(rW(e=>e.state.ui.itemSelector)),o=(0,rB.useAppStore)(e=>{var t;return null==(t=e.selectedItem)?void 0:t.props.id}),i=(0,rB.useAppStoreApi)();(0,rB.useRegisterFieldsSlice)(i,o);let a=(0,rB.useAppStore)(e=>e.fields.loading),l=(0,rB.useAppStore)(rW(e=>e.fields.id===o?Object.keys(e.fields.fields):[])),s=a||r,c=(0,r_.useMemo)(()=>t.fields||pc,[t]);return(0,rV.jsxs)("form",{className:ps({wrapFields:e}),onSubmit:e=>{e.preventDefault()},children:[(0,rV.jsx)(c,{isLoading:s,itemSelector:n,children:l.map(e=>(0,rV.jsx)(pd,{fieldName:e},e))}),s&&(0,rV.jsx)("div",{className:ps("loadingOverlay"),children:(0,rV.jsx)("div",{className:ps("loadingOverlayInner"),children:(0,rV.jsx)(rB.Loader,{size:16})})})]})});(0,rF.init_react_import)();var ph=(0,rw.get_class_name_factory_default)("FieldsPlugin",{FieldsPlugin:"_FieldsPlugin_18cj3_1","FieldsPlugin-header":"_FieldsPlugin-header_18cj3_7"}),pf=()=>{let e=(0,rB.useMessage)("label-page"),t=(0,rB.useAppStore)(e=>{var t,r;let n=e.selectedItem;return n?null!=(r=null==(t=e.config.components[n.type])?void 0:t.label)?r:n.type:null});return null!=t?t:e};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var pv=`@import "https://rsms.me/inter/inter.css";

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
}`,pg="data-puck-style-source",pm="puck",p_=new WeakMap,pb=(e,t,r=!1)=>{let n=e.head;if(n){if(t.parentElement!==n)return void(r?n.prepend(t):n.append(t));r&&n.firstChild!==t&&n.prepend(t),r||n.lastChild===t||n.append(t)}},px=e=>(null==e?void 0:e.getAttribute(pg))===pm,py=e=>{var t;let r=(t=null==e?void 0:e.document)?t:"u">typeof document?document:void 0;(0,r_.useInsertionEffect)(()=>{if(!e||!r)return;let t=(e=>{let t=p_.get(e);if(t)return t;let r=new Map;return p_.set(e,r),r})(r),n=t.get(e.id);if(n)n.count=n.count+1,n.el.textContent!==e.cssText&&(n.el.textContent=e.cssText),pb(r,n.el,e.prepend);else{let n=((e,t,r,n=!1)=>{let o=e.createElement("style");return o.setAttribute(pg,pm),o.setAttribute("data-puck-style-id",t),o.textContent=r,pb(e,o,n),o})(r,e.id,e.cssText,e.prepend);t.set(e.id,{count:1,el:n})}return()=>{let r=t.get(e.id);r&&(r.count=r.count-1,r.count<=0&&(r.el.remove(),t.delete(e.id)))}},[null==e?void 0:e.cssText,null==e?void 0:e.id,null==e?void 0:e.prepend,null==e?void 0:e.document,r])},pk=null,pw='style, link[rel="stylesheet"]',pS="data-puck-style-mirror",pI=e=>!(!e.matches(pw)||px(e))&&("STYLE"!==e.tagName||!!e.innerHTML.trim()),pj=e=>Array.from(document.styleSheets).find(t=>t.ownerNode.href===e.href),pz=(e,t)=>{let r=e.attributes;(null==r?void 0:r.length)>0&&Array.from(r).forEach(e=>{t.setAttribute(e.name,e.value)})},pE=({children:e,debug:t=!1,onStylesLoaded:r=()=>null,syncHostStyles:n=!0})=>{let{document:o,window:i}=pA();return py(o?{cssText:'/* styles/color.css */\n@layer puck-tokens {\n  :root {\n    --puck-color-rose-01: #4a001c;\n    --puck-color-rose-02: #670833;\n    --puck-color-rose-03: #87114c;\n    --puck-color-rose-04: #a81a66;\n    --puck-color-rose-05: #bc5089;\n    --puck-color-rose-06: #cc7ca5;\n    --puck-color-rose-07: #d89aba;\n    --puck-color-rose-08: #e3b8cf;\n    --puck-color-rose-09: #efd6e3;\n    --puck-color-rose-10: #f6eaf1;\n    --puck-color-rose-11: #faf4f8;\n    --puck-color-rose-12: #fef8fc;\n    --puck-color-azure-01: #00175d;\n    --puck-color-azure-02: #002c77;\n    --puck-color-azure-03: #014292;\n    --puck-color-azure-04: #0158ad;\n    --puck-color-azure-05: #3479be;\n    --puck-color-azure-06: #6499cf;\n    --puck-color-azure-07: #88b0da;\n    --puck-color-azure-08: #abc7e5;\n    --puck-color-azure-09: #cfdff0;\n    --puck-color-azure-10: #e7eef7;\n    --puck-color-azure-11: #f3f6fb;\n    --puck-color-azure-12: #f7faff;\n    --puck-color-green-01: #002000;\n    --puck-color-green-02: #043604;\n    --puck-color-green-03: #084e08;\n    --puck-color-green-04: #0c680c;\n    --puck-color-green-05: #1d882f;\n    --puck-color-green-06: #2faa53;\n    --puck-color-green-07: #56c16f;\n    --puck-color-green-08: #7dd78b;\n    --puck-color-green-09: #b8e8bf;\n    --puck-color-green-10: #ddf3e0;\n    --puck-color-green-11: #eff8f0;\n    --puck-color-green-12: #f3fcf4;\n    --puck-color-yellow-01: #211000;\n    --puck-color-yellow-02: #362700;\n    --puck-color-yellow-03: #4c4000;\n    --puck-color-yellow-04: #645a00;\n    --puck-color-yellow-05: #877614;\n    --puck-color-yellow-06: #ab9429;\n    --puck-color-yellow-07: #bfac4e;\n    --puck-color-yellow-08: #d4c474;\n    --puck-color-yellow-09: #e6deb1;\n    --puck-color-yellow-10: #f3efd9;\n    --puck-color-yellow-11: #f9f7ed;\n    --puck-color-yellow-12: #fcfaf0;\n    --puck-color-red-01: #4c0000;\n    --puck-color-red-02: #6a0a10;\n    --puck-color-red-03: #8a1422;\n    --puck-color-red-04: #ac1f35;\n    --puck-color-red-05: #bf5366;\n    --puck-color-red-06: #ce7e8e;\n    --puck-color-red-07: #d99ca8;\n    --puck-color-red-08: #e4b9c2;\n    --puck-color-red-09: #efd7db;\n    --puck-color-red-10: #f6eaec;\n    --puck-color-red-11: #faf4f5;\n    --puck-color-red-12: #fff9fa;\n    --puck-color-grey-01: #181818;\n    --puck-color-grey-02: #292929;\n    --puck-color-grey-03: #404040;\n    --puck-color-grey-04: #5a5a5a;\n    --puck-color-grey-05: #767676;\n    --puck-color-grey-06: #949494;\n    --puck-color-grey-07: #ababab;\n    --puck-color-grey-08: #c3c3c3;\n    --puck-color-grey-09: #dcdcdc;\n    --puck-color-grey-10: #efefef;\n    --puck-color-grey-11: #f5f5f5;\n    --puck-color-grey-12: #fafafa;\n    --puck-color-black: #000000;\n    --puck-color-white: #ffffff;\n  }\n}\n\n/* styles/tokens.css */\n@layer puck-tokens {\n  :root {\n    --puck-color-surface: var(--puck-color-white);\n    --puck-color-surface-muted: var(--puck-color-grey-11);\n    --puck-color-surface-subtle: var(--puck-color-grey-12);\n    --puck-color-surface-inverse: var(--puck-color-grey-01);\n    --puck-color-border: var(--puck-color-grey-09);\n    --puck-color-border-hover: var(--puck-color-grey-05);\n    --puck-color-border-muted: var(--puck-color-grey-10);\n    --puck-color-border-inverse: var(--puck-color-grey-05);\n    --puck-color-text: var(--puck-color-black);\n    --puck-color-text-secondary: var(--puck-color-grey-04);\n    --puck-color-text-muted: var(--puck-color-grey-05);\n    --puck-color-text-subtle: var(--puck-color-grey-07);\n    --puck-color-text-inverse: var(--puck-color-white);\n    --puck-opacity-text-inverse: 0.75;\n    --puck-color-interactive: var(--puck-color-azure-04);\n    --puck-color-interactive-hover: var(--puck-color-azure-03);\n    --puck-color-interactive-active: var(--puck-color-azure-02);\n    --puck-color-interactive-subtle: var(--puck-color-azure-10);\n    --puck-color-interactive-soft: var(--puck-color-azure-11);\n    --puck-color-interactive-soft-hover: var(--puck-color-azure-12);\n    --puck-color-interactive-neutral-hover: var(--puck-color-grey-10);\n    --puck-color-interactive-inverse-hover: var(--puck-color-azure-06);\n    --puck-color-interactive-inverse-active: var(--puck-color-azure-07);\n    --puck-color-focus-ring: var(--puck-color-azure-05);\n    --puck-color-selection-bg: color-mix( in srgb, var(--puck-color-azure-09) 30%, transparent );\n    --puck-color-selection-border: var(--puck-color-azure-08);\n    --puck-color-line-placeholder: var(--puck-color-azure-06);\n    --puck-color-highlight: var(--puck-color-rose-07);\n    --puck-color-bg-disabled: var(--puck-color-grey-07);\n    --puck-color-text-disabled: var(--puck-color-grey-03);\n    --puck-color-overlay-backdrop: color-mix( in srgb, var(--puck-color-black) 75%, transparent );\n    --puck-space-1: 4px;\n    --puck-space-2: 8px;\n    --puck-space-3: 12px;\n    --puck-space-4: 16px;\n    --puck-space-5: 24px;\n    --puck-space-chrome-gutter: var(--puck-space-4);\n    --puck-radius-none: 0;\n    --puck-radius-xs: 2px;\n    --puck-radius-s: 3px;\n    --puck-radius-m: 4px;\n    --puck-radius-l: 8px;\n    --puck-radius-pill: 30px;\n    --puck-radius-round: 100%;\n    --puck-border-width-hairline: 0.5px;\n    --puck-border-width-regular: 1px;\n    --puck-border-width-focus: 2px;\n    --puck-border-width-strong: 4px;\n    --puck-duration-fast: 50ms;\n    --puck-duration-medium: 150ms;\n    --puck-duration-slow: 250ms;\n    --puck-ease-exit: ease-in;\n    --puck-ease-emphasized: ease-in-out;\n    --puck-ease-entrance: ease-out;\n    --puck-font-weight-regular: 400;\n    --puck-font-weight-medium: 500;\n    --puck-font-weight-semibold: 600;\n    --puck-font-weight-bold: 700;\n    --puck-font-weight-heavy: 800;\n    --puck-letter-spacing-ui: 0.05ch;\n    --puck-letter-spacing-heading: 0.08ch;\n    --puck-icon-size-xs: 14px;\n    --puck-icon-size-s: 16px;\n    --puck-icon-size-m: 18px;\n    --puck-icon-size-l: 24px;\n    --puck-space-m-unitless: 24;\n    --puck-user-sidebar-left-width: var(--puck-sidebar-width);\n    --puck-user-sidebar-right-width: var(--puck-sidebar-width);\n    --puck-slot-min-empty-height: 128px;\n    --puck-line-placeholder-width: 2px;\n  }\n}\n\n/* styles/typography.css */\n@layer puck-tokens {\n  :root {\n    --puck-font-size-scale-base-unitless: 12;\n    --puck-font-size-xxxs-unitless: 12;\n    --puck-font-size-xxs-unitless: 14;\n    --puck-font-size-xs-unitless: 16;\n    --puck-font-size-s-unitless: 18;\n    --puck-font-size-m-unitless: 21;\n    --puck-font-size-l-unitless: 24;\n    --puck-font-size-xl-unitless: 28;\n    --puck-font-size-xxl-unitless: 36;\n    --puck-font-size-xxxl-unitless: 48;\n    --puck-font-size-xxxxl-unitless: 56;\n    --puck-font-size-xxxs: calc( 1rem * var(--puck-font-size-xxxs-unitless) / 16 );\n    --puck-font-size-xxs: calc(1rem * var(--puck-font-size-xxs-unitless) / 16);\n    --puck-font-size-xs: calc(1rem * var(--puck-font-size-xs-unitless) / 16);\n    --puck-font-size-s: calc(1rem * var(--puck-font-size-s-unitless) / 16);\n    --puck-font-size-m: calc(1rem * var(--puck-font-size-m-unitless) / 16);\n    --puck-font-size-l: calc(1rem * var(--puck-font-size-l-unitless) / 16);\n    --puck-font-size-xl: calc(1rem * var(--puck-font-size-xl-unitless) / 16);\n    --puck-font-size-xxl: calc(1rem * var(--puck-font-size-xxl-unitless) / 16);\n    --puck-font-size-xxxl: calc( 1rem * var(--puck-font-size-xxxl-unitless) / 16 );\n    --puck-font-size-xxxxl: calc( 1rem * var(--puck-font-size-xxxxl-unitless) / 16 );\n    --puck-font-size-base: var(--puck-font-size-xs);\n    --puck-line-height-reset: 1;\n    --puck-line-height-xs: calc( var(--puck-space-m-unitless) / var(--puck-font-size-m-unitless) );\n    --puck-line-height-s: calc( var(--puck-space-m-unitless) / var(--puck-font-size-s-unitless) );\n    --puck-line-height-m: calc( var(--puck-space-m-unitless) / var(--puck-font-size-xs-unitless) );\n    --puck-line-height-l: calc( var(--puck-space-m-unitless) / var(--puck-font-size-xxs-unitless) );\n    --puck-line-height-xl: calc( var(--puck-space-m-unitless) / var(--puck-font-size-scale-base-unitless) );\n    --puck-line-height-base: var(--puck-line-height-m);\n    --puck-fallback-font-stack:\n      -apple-system,\n      BlinkMacSystemFont,\n      Segoe UI,\n      Helvetica Neue,\n      sans-serif,\n      Apple Color Emoji,\n      Segoe UI Emoji,\n      Segoe UI Symbol;\n    --puck-font-family: Inter, var(--puck-fallback-font-stack);\n    --puck-font-family-monospaced:\n      ui-monospace,\n      "Cascadia Code",\n      "Source Code Pro",\n      Menlo,\n      Consolas,\n      "DejaVu Sans Mono",\n      monospace;\n  }\n  @supports (font-variation-settings: normal) {\n    :root {\n      --puck-font-family: InterVariable, var(--puck-fallback-font-stack);\n    }\n  }\n}\n\n/* bundle/core.css */\n:root {\n  --_puck-styles-loaded: "true";\n}\n#frame-root {\n  height: 1px;\n  min-height: 100vh;\n}\n[data-puck-entry] {\n  position: relative;\n  z-index: 0;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/ActionBar/styles.module.css/#css-module-data */\n._ActionBar_5vdfr_1 {\n  align-items: center;\n  cursor: default;\n  display: flex;\n  width: auto;\n  padding-top: var(--puck-actionbar-space-y, var(--puck-space-1));\n  padding-bottom: var(--puck-actionbar-space-y, var(--puck-space-1));\n  padding-inline-start: var(--puck-actionbar-space-x, 0);\n  padding-inline-end: var(--puck-actionbar-space-x, 0);\n  border-radius: var(--puck-actionbar-radius, var(--puck-radius-l));\n  background: var(--puck-actionbar-color-bg, var(--puck-color-surface-inverse));\n  color: var(--puck-color-text-inverse);\n  font-family: var(--puck-font-family);\n  min-height: 26px;\n}\n._ActionBar-label_5vdfr_17 {\n  color: var(--puck-actionbar-color-text, var(--puck-color-text-inverse));\n  font-size: var(--puck-actionbar-font-size, var(--puck-font-size-xxxs));\n  opacity: var(--puck-actionbar-opacity-text, var(--puck-opacity-text-inverse));\n  font-weight: var(--puck-font-weight-medium);\n  padding-inline-start: var(--puck-space-2);\n  padding-inline-end: var(--puck-space-2);\n  margin-inline-start: var(--puck-space-1);\n  margin-inline-end: var(--puck-space-1);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n._ActionBarAction_5vdfr_30 + ._ActionBar-label_5vdfr_17 {\n  padding-inline-start: 0;\n}\n._ActionBar-label_5vdfr_17 + ._ActionBarAction_5vdfr_30 {\n  margin-inline-start: calc(var(--puck-space-1) * -1);\n}\n._ActionBar-group_5vdfr_38 {\n  align-items: center;\n  border-inline-start: var(--puck-border-width-hairline) solid var(--puck-actionbar-color-separator, var(--puck-color-border-inverse));\n  display: flex;\n  height: 100%;\n  padding-inline-start: var(--puck-space-1);\n  padding-inline-end: var(--puck-space-1);\n}\n._ActionBar-group_5vdfr_38:first-of-type {\n  border-inline-start: 0;\n}\n._ActionBar-group_5vdfr_38:empty {\n  display: none;\n}\n._ActionBarAction_5vdfr_30 {\n  background: transparent;\n  border: none;\n  color: var(--puck-actionbar-color-text, var(--puck-color-text-inverse));\n  cursor: pointer;\n  padding: var(--puck-actionbar-action-space, 6px);\n  margin-inline-start: var(--puck-space-1);\n  margin-inline-end: var(--puck-space-1);\n  border-radius: var(--puck-radius-m);\n  overflow: hidden;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  opacity: var(--puck-actionbar-opacity-text, var(--puck-opacity-text-inverse));\n  transition: color var(--puck-duration-fast) var(--puck-ease-exit), opacity var(--puck-duration-fast) var(--puck-ease-exit);\n}\n._ActionBarAction--disabled_5vdfr_74 {\n  cursor: auto;\n  color: var( --puck-actionbar-color-action-disabled, var(--puck-color-text-inverse) );\n  opacity: var(--puck-actionbar-opacity-action-disabled, 0.54);\n}\n._ActionBarAction_5vdfr_30 svg {\n  max-width: none !important;\n}\n._ActionBarAction_5vdfr_30:focus-visible {\n  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);\n  outline-offset: calc(var(--puck-border-width-focus) * -1);\n}\n@media (hover: hover) and (pointer: fine) {\n  ._ActionBarAction_5vdfr_30:hover:not(._ActionBarAction--disabled_5vdfr_74) {\n    color: var( --puck-actionbar-color-action-hover, var(--puck-color-interactive-inverse-hover) );\n    opacity: 1;\n    transition: none;\n  }\n}\n._ActionBarAction_5vdfr_30:active:not(._ActionBarAction--disabled_5vdfr_74),\n._ActionBarAction--active_5vdfr_104 {\n  color: var( --puck-actionbar-color-action-active, var(--puck-color-interactive-inverse-active) );\n  opacity: 1;\n  transition: none;\n}\n._ActionBar-group_5vdfr_38 * {\n  margin: 0;\n}\n._ActionBar-separator_5vdfr_117 {\n  background: var( --puck-actionbar-color-separator, var(--puck-color-border-inverse) );\n  margin-inline: var(--puck-space-1);\n  width: var( --puck-border-width-hairline );\n  height: 100%;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/DraggableComponent/styles.module.css/#css-module-data */\n._DraggableComponent_1627v_1 {\n  position: absolute;\n  pointer-events: none;\n}\n._DraggableComponent-overlayWrapper_1627v_6 {\n  height: 100%;\n  width: 100%;\n  top: 0;\n  position: absolute;\n  pointer-events: none;\n  box-sizing: border-box;\n  z-index: 1;\n}\n._DraggableComponent-overlay_1627v_6 {\n  cursor: pointer;\n  height: 100%;\n  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var( --puck-slot-component-color-overlay-border, var(--puck-color-selection-border) ) solid;\n  outline-offset: calc(var(--puck-slot-component-border-width, var(--puck-border-width-focus)) * -1);\n  width: 100%;\n}\n._DraggableComponent_1627v_1:focus-visible > ._DraggableComponent-overlayWrapper_1627v_6 {\n  outline: var(--puck-border-width-regular) solid var(--puck-color-focus-ring);\n}\n._DraggableComponent-loadingOverlay_1627v_38 {\n  background: var(--puck-color-surface);\n  color: var(--puck-color-text);\n  border-radius: var(--puck-radius-m);\n  display: flex;\n  padding: var(--puck-space-2);\n  top: var(--puck-space-2);\n  right: var(--puck-space-2);\n  position: absolute;\n  z-index: 1;\n  pointer-events: all;\n  box-sizing: border-box;\n  opacity: 0.8;\n  z-index: 1;\n}\n._DraggableComponent--hover_1627v_54 > ._DraggableComponent-overlayWrapper_1627v_6 > ._DraggableComponent-overlay_1627v_6 {\n  background: var( --puck-slot-component-color-overlay, var(--puck-color-selection-bg) );\n  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var( --puck-slot-component-color-overlay-border, var(--puck-color-selection-border) ) solid;\n}\n._DraggableComponent--isSelected_1627v_72 > ._DraggableComponent-overlayWrapper_1627v_6 > ._DraggableComponent-overlay_1627v_6 {\n  outline-color: var( --puck-slot-component-color-border-selected, var(--puck-color-selection-border) );\n}\n._DraggableComponent_1627v_1:has(._DraggableComponent--hover_1627v_54 > ._DraggableComponent-overlayWrapper_1627v_6) > ._DraggableComponent-overlayWrapper_1627v_6 {\n  display: none;\n}\n._DraggableComponent-actionsOverlay_1627v_89 {\n  position: sticky;\n  opacity: 0;\n  pointer-events: none;\n  z-index: 2;\n}\n._DraggableComponent--isSelected_1627v_72 ._DraggableComponent-actionsOverlay_1627v_89 {\n  opacity: 1;\n  pointer-events: auto;\n}\n._DraggableComponent-actions_1627v_89 {\n  position: absolute;\n  width: auto;\n  cursor: grab;\n  display: flex;\n  box-sizing: border-box;\n  transform-origin: right top;\n  min-height: 36px;\n}\n._DraggableComponent-actionsAction_1627v_111 {\n  height: var(--puck-actionbar-action-size, var(--puck-icon-size-s));\n  width: var(--puck-actionbar-action-size, var(--puck-icon-size-s));\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/Drawer/styles.module.css/#css-module-data */\n._Drawer_1n90m_1 {\n  display: flex;\n  flex-direction: column;\n  font-family: var(--puck-font-family);\n  gap: var(--puck-space-3);\n}\n._Drawer-draggable_1n90m_8 {\n  position: relative;\n}\n._Drawer-draggableBg_1n90m_12 {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  pointer-events: none;\n  z-index: -1;\n}\n._DrawerItem-draggable_1n90m_22 {\n  background: var(--puck-drawer-item-color-bg, var(--puck-color-surface));\n  color: var(--puck-drawer-item-color-text, var(--puck-color-text));\n  cursor: grab;\n  padding: var(--puck-drawer-item-space, var(--puck-space-3));\n  display: flex;\n  border: var(--puck-drawer-item-border-width, var(--puck-border-width-regular)) var(--puck-drawer-item-color-border, var(--puck-color-border)) solid;\n  border-radius: var(--puck-drawer-item-radius, var(--puck-radius-m));\n  font-size: var(--puck-drawer-item-font-size, var(--puck-font-size-xxs));\n  justify-content: space-between;\n  align-items: center;\n  transition: background-color var(--puck-duration-fast) var(--puck-ease-exit), color var(--puck-duration-fast) var(--puck-ease-exit);\n}\n._DrawerItem--disabled_1n90m_38 ._DrawerItem-draggable_1n90m_22 {\n  background: var(--puck-color-surface-muted);\n  color: var(--puck-color-text-muted);\n  cursor: not-allowed;\n}\n._DrawerItem_1n90m_22:focus-visible {\n  outline: 0;\n}\n._Drawer_1n90m_1:not(._Drawer--isDraggingFrom_1n90m_48) ._DrawerItem_1n90m_22:focus-visible ._DrawerItem-draggable_1n90m_22 {\n  border-radius: var(--puck-radius-m);\n  outline: var(--puck-border-width-focus) solid var(--puck-color-focus-ring);\n  outline-offset: var(--puck-border-width-focus);\n}\n@media (hover: hover) and (pointer: fine) {\n  ._Drawer_1n90m_1:not(._Drawer--isDraggingFrom_1n90m_48) ._DrawerItem_1n90m_22:not(._DrawerItem--disabled_1n90m_38) ._DrawerItem-draggable_1n90m_22:hover {\n    background-color: var( --puck-drawer-item-color-bg-hover, var(--puck-color-interactive-soft-hover) );\n    color: var( --puck-drawer-item-color-text-hover, var(--puck-color-interactive) );\n    transition: none;\n  }\n}\n._DrawerItem-name_1n90m_72 {\n  overflow-x: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/DropZone/styles.module.css/#css-module-data */\n._DropZone_wc2ks_1 {\n  position: relative;\n  height: 100%;\n  min-height: var(--puck-slot-min-empty-height);\n  outline-offset: calc(var(--puck-slot-border-width, var(--puck-border-width-focus)) * -1);\n  width: 100%;\n}\n._DropZone--hasChildren_wc2ks_11 {\n  min-height: 0;\n}\n._DropZone_wc2ks_1:empty {\n  min-height: var(--puck-slot-min-empty-height);\n}\n[data-puck-entry]:not([data-puck-dragging]) ._DropZone_wc2ks_1 {\n  transition: min-height var(--puck-duration-medium) var(--puck-ease-exit);\n}\n._DropZone--isAreaSelected_wc2ks_24,\n._DropZone--hoveringOverArea_wc2ks_25:not(._DropZone--isRootZone_wc2ks_25) {\n  background: var(--puck-slot-color-bg, var(--puck-color-selection-bg));\n  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));\n}\n._DropZone_wc2ks_1:empty {\n  background: var(--puck-slot-color-bg, var(--puck-color-selection-bg));\n  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));\n}\n._DropZone-item_wc2ks_39 {\n  position: relative;\n}\n._DropZone-linePlaceholder_wc2ks_43 {\n  background: var( --puck-slot-component-color-placeholder, var(--puck-color-line-placeholder) );\n  border-radius: calc(var(--puck-line-placeholder-width, 2px) / 2);\n  pointer-events: none;\n  position: absolute;\n  z-index: 1;\n}\n._DropZone-hitbox_wc2ks_55 {\n  position: absolute;\n  bottom: calc(var(--puck-space-3) * -1);\n  height: var(--puck-space-5);\n  width: 100%;\n  z-index: 1;\n}\n[data-puck-dragging] ._DropZone--isEnabled_wc2ks_63 {\n  outline: var(--puck-slot-border-width, var(--puck-border-width-focus)) var(--puck-slot-border-style, dashed) var(--puck-slot-color-border, var(--puck-color-selection-border));\n}\n._DropZone_wc2ks_1 > *:not([data-puck-component]):not([data-puck-line-placeholder]) {\n  opacity: 0;\n}\nbody:has(._DropZone--isAnimating_wc2ks_74:empty) [data-puck-overlay] {\n  opacity: 0 !important;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/InlineTextField/styles.module.css/#css-module-data */\n._InlineTextField_104qp_1 {\n  cursor: text;\n  display: inline-block;\n  white-space: pre-wrap;\n  text-decoration: inherit;\n}\n[data-dnd-dragging] ._InlineTextField_104qp_1 {\n  cursor: none;\n  caret-color: transparent;\n}\n[data-dnd-dragging] ._InlineTextField_104qp_1::selection {\n  display: none;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/Loader/styles.module.css/#css-module-data */\n@keyframes _loader-animation_1w5zn_1 {\n  0% {\n    transform: rotate(0deg) scale(1);\n  }\n  50% {\n    transform: rotate(180deg) scale(0.8);\n  }\n  100% {\n    transform: rotate(360deg) scale(1);\n  }\n}\n._Loader_1w5zn_13 {\n  background: transparent;\n  border-radius: var(--puck-radius-round);\n  border: var(--puck-border-width-focus) solid currentColor;\n  border-bottom-color: transparent;\n  display: inline-block;\n  animation: _loader-animation_1w5zn_1 1s 0s infinite linear;\n  animation-fill-mode: both;\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/RichTextMenu/styles.module.css/#css-module-data */\n._RichTextMenu_1ve2j_1 {\n  display: flex;\n  flex-direction: row;\n  flex-wrap: nowrap;\n}\n._RichTextMenu--form_1ve2j_7 {\n  border-top-left-radius: var(--puck-field-radius, var(--puck-radius-m));\n  border-top-right-radius: var(--puck-field-radius, var(--puck-radius-m));\n  padding: var(--puck-field-richtext-menu-space-y, 6px) var(--puck-field-richtext-menu-space-x, 6px);\n  background-color: var( --puck-field-richtext-menu-color-bg, var(--puck-color-surface-subtle) );\n  position: relative;\n  scrollbar-width: none;\n  overflow-x: auto;\n}\n._RichTextMenu-group_1ve2j_21 {\n  display: flex;\n  align-items: space-between;\n  flex-direction: row;\n  flex-wrap: nowrap;\n  padding-inline: 6px;\n  gap: 2px;\n  position: relative;\n}\n._RichTextMenu-group_1ve2j_21:first-of-type {\n  padding-left: 0;\n}\n._RichTextMenu-group_1ve2j_21:last-of-type {\n  padding-right: 0;\n}\n._RichTextMenu--inline_1ve2j_39 ._RichTextMenu-group_1ve2j_21 {\n  color: var(--puck-color-text-inverse);\n  gap: 0px;\n  flex-wrap: nowrap;\n}\n._RichTextMenu-group_1ve2j_21 + ._RichTextMenu-group_1ve2j_21 {\n  border-left: var(--puck-border-width-regular) solid var( --puck-field-richtext-menu-color-separator, var(--puck-color-border-muted) );\n}\n._RichTextMenu--inline_1ve2j_39 ._RichTextMenu-group_1ve2j_21 + ._RichTextMenu-group_1ve2j_21 {\n  border-left: var(--puck-border-width-hairline) solid var(--puck-color-border-inverse);\n}\n\n/* css-module:/home/runner/work/puck/puck/packages/core/components/RichTextMenu/components/Control/styles.module.css/#css-module-data */\n._Control_id4pm_1 .lucide {\n  height: var(--puck-icon-size-m);\n  width: var(--puck-icon-size-m);\n}\n._Control--inline_id4pm_6 .lucide {\n  height: var(--puck-actionbar-action-size, var(--puck-icon-size-s));\n  width: var(--puck-actionbar-action-size, var(--puck-icon-size-s));\n}\n\n/* components/DraggableComponent/styles.css */\n[data-puck-component] * {\n  pointer-events: none;\n  user-select: none;\n  -webkit-user-select: none;\n}\n[data-puck-component] {\n  cursor: grab;\n  pointer-events: auto !important;\n  user-select: none;\n  -webkit-user-select: none;\n}\n[data-puck-dropzone] {\n  pointer-events: auto !important;\n}\n[data-puck-disabled] {\n  cursor: pointer;\n}\n[data-dnd-placeholder]:not([data-puck-line-drag] *) {\n  background: var( --puck-slot-component-color-placeholder, var(--puck-color-azure-06) ) !important;\n  border: none !important;\n  color: transparent !important;\n  opacity: 0.3 !important;\n  outline: none !important;\n  transition: none !important;\n}\n[data-dnd-placeholder]:not([data-puck-line-drag] *) *,\n[data-dnd-placeholder]:not([data-puck-line-drag] *)::after,\n[data-dnd-placeholder]:not([data-puck-line-drag] *)::before {\n  opacity: 0 !important;\n}\n[data-puck-line-drag] [data-dnd-placeholder] {\n  opacity: 0.4 !important;\n  outline: none !important;\n  transition: none !important;\n}\n[data-puck-line-drag] [data-dnd-dragging][data-puck-component] {\n  opacity: 0.9 !important;\n}\n[data-dnd-dragging][data-puck-component] {\n  pointer-events: none !important;\n  outline: var( --puck-slot-component-border-width, var(--puck-border-width-focus) ) var(--puck-slot-component-color-border-dragging, var(--puck-color-azure-09)) solid !important;\n  outline-offset: calc(var(--puck-slot-component-border-width, var(--puck-border-width-focus)) * -1) !important;\n}\n[data-dnd-dragging][data-puck-component] > :first-child {\n  margin-top: 0 !important;\n}\n[data-dnd-dragging][data-puck-component] > :last-child {\n  margin-bottom: 0 !important;\n}\n\n/* lib/overlay-portal/styles.css */\n[data-puck-overlay-portal],\n[data-puck-overlay-portal] * {\n  pointer-events: auto !important;\n}\n[data-puck-entry][data-puck-dragging] [data-puck-overlay-portal],\n[data-puck-entry][data-puck-dragging] [data-puck-overlay-portal] * {\n  pointer-events: none !important;\n}\n[data-puck-entry][data-puck-preview-mode=edit] [data-puck-overlay-portal]:hover {\n  outline: 2px var(--puck-color-azure-09, #cfdff0) dashed;\n  outline-offset: 2px;\n}\n[data-puck-entry][data-puck-preview-mode=edit] [data-puck-overlay-portal]:focus-within {\n  outline: 2px var(--puck-color-azure-07, #88b0da) dashed;\n  outline-offset: 2px;\n}',document:o,id:"iframe-styles"}:null),(0,r_.useEffect)(()=>{let e;if(!i||!o)return()=>{};let a=[],l={},s=()=>{a.forEach(({mirror:e})=>{e.remove()}),a=[],Array.from(o.head.querySelectorAll(`[${pS}="true"]`)).forEach(e=>{e.remove()}),Object.keys(l).forEach(e=>{delete l[e]})},c=e=>a.findIndex(t=>t.original===e),u=(e,r=!1)=>(0,rF.__async)(null,null,function*(){let n;if("LINK"===e.nodeName&&r){(n=document.createElement("style")).type="text/css";let r=pj(e);r||(yield new Promise(t=>{let r=()=>{t(),e.removeEventListener("load",r)};e.addEventListener("load",r)}),r=pj(e));let o=(e=>{if(e)try{return Array.from(e.cssRules).map(e=>e.cssText).join("")}catch(t){console.warn("Access to stylesheet %s is denied. Ignoring…",e.href)}return""})(r);if(!o){t&&console.warn("Tried to load styles for link element, but couldn't find them. Skipping...");return}n.innerHTML=o,n.setAttribute("data-href",e.getAttribute("href"))}else n=e.cloneNode(!0);return n.setAttribute(pS,"true"),n}),d=new MutationObserver(e=>{e.forEach(e=>{"childList"===e.type&&(e.addedNodes.forEach(e=>{if(e.nodeType===Node.TEXT_NODE||e.nodeType===Node.ELEMENT_NODE){let r=e.nodeType===Node.TEXT_NODE?e.parentElement:e;r&&pI(r)&&setTimeout(()=>(0,rF.__async)(null,null,function*(){let e=c(r);if(e>-1){t&&console.log("Tried to add an element that was already mirrored. Updating instead..."),a[e].mirror.innerText=r.innerText;return}let n=yield u(r);if(!n)return;let i=(0,cr.default)(n.outerHTML);if(l[i]){t&&console.log("iframe already contains element that is being mirrored. Skipping...");return}l[i]=!0,o.head.append(n),a.push({original:r,mirror:n}),t&&console.log(`Added style node ${r.outerHTML}`)}),0)}}),e.removedNodes.forEach(e=>{if(e.nodeType===Node.TEXT_NODE||e.nodeType===Node.ELEMENT_NODE){let r=e.nodeType===Node.TEXT_NODE?e.parentElement:e;r&&r.matches(pw)&&!px(r)&&setTimeout(()=>(e=>{var r,n;let o=c(e);if(-1===o){t&&console.log("Tried to remove an element that did not exist. Skipping...");return}let i=(0,cr.default)(e.outerHTML);null==(n=null==(r=a[o])?void 0:r.mirror)||n.remove(),delete l[i],t&&console.log(`Removed style node ${e.outerHTML}`)})(r),0)}}))})});if(!n)return r(),()=>{d.disconnect(),s()};let p=i.parent.document,h=(e=[],p.querySelectorAll(pw).forEach(t=>{pI(t)&&e.push(t)}),e),f=[],v=0;return pz(p.getElementsByTagName("html")[0],o.documentElement),pz(p.getElementsByTagName("body")[0],o.body),Promise.all(h.map((e,t)=>(0,rF.__async)(null,null,function*(){if("LINK"===e.nodeName){let t=e.href;if(f.indexOf(t)>-1)return;f.push(t)}let t=yield u(e);if(t)return a.push({original:e,mirror:t}),t}))).then(e=>{let t=e.filter(e=>void 0!==e);t.forEach(e=>{e.onload=()=>{(v+=1)>=t.length&&r()},e.onerror=()=>{let n=e instanceof HTMLLinkElement?e.href:void 0;console.warn(`AutoFrame couldn't load a stylesheet${n?`: ${n}`:""}. This can happen if the parent document's stylesheet is blocked by the iframe's CSP, returns a non-2xx status, or fails to reach the network.`),(v+=1)>=t.length&&r()}}),o.head.querySelectorAll(`[${pS}="true"]`).forEach(e=>{e.remove()}),o.head.append(...t),t.forEach(e=>{"STYLE"===e.nodeName&&(v+=1)}),v>=t.length&&r(),d.observe(p.head,{childList:!0,subtree:!0}),t.forEach(e=>{l[(0,cr.default)(e.outerHTML)]=!0})}),()=>{d.disconnect(),s()}},[n]),(0,rV.jsx)(rV.Fragment,{children:e})},pC=(0,r_.createContext)({}),pA=()=>(0,r_.useContext)(pC);function pP(e){var{children:t,className:r,debug:n,id:o,onReady:i=()=>{},onNotReady:a=()=>{},frameRef:l,syncHostStyles:s=!0}=e,c=(0,rF.__objRest)(e,["children","className","debug","id","onReady","onNotReady","frameRef","syncHostStyles"]);let[u,d]=(0,r_.useState)(!1),[p,h]=(0,r_.useState)({}),[f,v]=(0,r_.useState)(),[g,m]=(0,r_.useState)(!1);return(0,r_.useEffect)(()=>{u&&m(!s)},[u,s]),(0,r_.useEffect)(()=>{var e;if(l.current){let t=l.current.contentDocument,r=l.current.contentWindow;h({document:t||void 0,window:r||void 0}),v(null==(e=l.current.contentDocument)?void 0:e.getElementById("frame-root")),t&&r&&g?i():a()}},[l,u,g]),(0,rV.jsx)("iframe",(0,rF.__spreadProps)((0,rF.__spreadValues)({},c),{className:r,id:o,srcDoc:'<!DOCTYPE html><html><head></head><body><div id="frame-root" data-puck-entry></div></body></html>',ref:l,onLoad:()=>{d(!0)},children:(0,rV.jsx)(pC.Provider,{value:p,children:u&&f&&(0,rV.jsx)(pE,{debug:n,onStylesLoaded:()=>m(!0),syncHostStyles:s,children:(0,lx.createPortal)(t,f)})})}))}pP.displayName="AutoFrame",(0,rF.init_react_import)();var pM=rj(ds),pO=(0,r_.memo)(()=>{var e,t,r,n;let o=(0,rB.useAppStore)(rW(e=>{var t;return null==(t=e.state.indexes.nodes.root)?void 0:t.flatData.props})),i=(0,rB.useAppStore)(e=>e.config),a=(0,rB.useAppStore)(e=>e.metadata),l=u2(i,(0,r_.useMemo)(()=>{let e=(0,rS.toComponent)({props:null!=o?o:{}});return(0,rS.expandNode)(e)},[o]),pM),s=(0,r_.useMemo)(()=>(0,rF.__spreadProps)((0,rF.__spreadValues)({},l),{children:(0,rV.jsx)(df,{zone:rS.rootDroppableId}),puck:{renderDropZone:df,isEditing:!0,dragRef:null,metadata:a},editMode:!0}),[l,a]),c=rO(null!=(t=null==(e=i.root)?void 0:e.fields)?t:{},s);return(null==(r=i.root)?void 0:r.render)?null==(n=i.root)?void 0:n.render((0,rF.__spreadProps)((0,rF.__spreadValues)((0,rF.__spreadValues)({},s),c),{id:"puck-root"})):(0,rV.jsx)(rV.Fragment,{children:s.children})});pO.displayName="EditorPage",(0,rF.init_react_import)();var pD=(0,rw.get_class_name_factory_default)("PuckPreview",{PuckPreview:"_PuckPreview_zbic3_1","PuckPreview-frame":"_PuckPreview-frame_zbic3_6"}),pT=({id:e="puck-preview"})=>{let t,r,n,o,i=(0,rB.useAppStore)(e=>e.dispatch),a=(0,rB.useAppStore)(e=>e.config),l=(0,rB.useAppStore)(e=>e.setStatus),s=(0,rB.useAppStore)(e=>e.iframe),c=(0,rB.useAppStore)(e=>e.overrides),u=(0,rB.useAppStore)(e=>e.metadata),d=(0,rB.useAppStore)(e=>"edit"===e.state.ui.previewMode?null:e.state.data),p=(0,r_.useMemo)(()=>c.iframe,[c]),h=(0,r_.useRef)(null);t=(0,rB.useAppStore)(e=>e.status),(0,r_.useEffect)(()=>{if(h.current&&"READY"===t){var e;let t=h.current,r=e=>{let r=new uD("pointermove",(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{bubbles:!0,cancelable:!1,clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,pointerType:e.pointerType,isPrimary:e.isPrimary,originalTarget:e.target}));t.dispatchEvent(r)},n=()=>{var e;null==(e=t.contentDocument)||e.removeEventListener("pointermove",r)};return n(),null==(e=t.contentDocument)||e.addEventListener("pointermove",r,{capture:!0}),()=>{n()}}},[t]),r=(0,rB.useAppStore)(e=>e.state.ui.previewMode),n=(0,rB.useAppStore)(e=>e.status),o=(0,rB.useAppStore)(e=>e.iframe.enabled),(0,r_.useEffect)(()=>{var e,t;let n=o?null==(t=null==(e=h.current)?void 0:e.contentDocument)?void 0:t.querySelector("[data-puck-entry]"):h.current;null==n||n.setAttribute("data-puck-preview-mode",r)},[r,n,o]);let f=d?(0,rV.jsx)(dm,{data:d,config:a,metadata:u}):(0,rV.jsx)(pO,{});return(0,r_.useEffect)(()=>{s.enabled||l("READY")},[s.enabled]),(0,rV.jsx)("div",{className:pD(),id:e,"data-puck-preview":!0,onClick:e=>{let t=e.target;t.hasAttribute("data-puck-component")||t.hasAttribute("data-puck-dropzone")||i({type:"setUi",ui:{itemSelector:null}})},children:s.enabled?(0,rV.jsx)(pP,{id:"preview-frame",className:pD("frame"),"data-rfd-iframe":!0,syncHostStyles:s.syncHostStyles,onReady:()=>{l("READY")},onNotReady:()=>{l("MOUNTED")},frameRef:h,children:(0,rV.jsx)(pC.Consumer,{children:({document:e})=>p?(0,rV.jsx)(p,{document:e,children:f}):f})}):(0,rV.jsx)("div",{id:"preview-frame",className:pD("frame"),ref:h,"data-puck-entry":!0,children:f})})};(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var pN={Puck:"_Puck_tzaxg_19","Puck-portal":"_Puck-portal_tzaxg_31",PuckLayout:"_PuckLayout_tzaxg_36","PuckLayout-inner":"_PuckLayout-inner_tzaxg_40","Puck--hidePlugins":"_Puck--hidePlugins_tzaxg_73","PuckLayout--mounted":"_PuckLayout--mounted_tzaxg_78","PuckLayout--mobilePanelHeightToggle":"_PuckLayout--mobilePanelHeightToggle_tzaxg_82","PuckLayout--leftSideBarVisible":"_PuckLayout--leftSideBarVisible_tzaxg_82","PuckLayout--isExpanded":"_PuckLayout--isExpanded_tzaxg_90","PuckLayout--mobilePanelHeightMinContent":"_PuckLayout--mobilePanelHeightMinContent_tzaxg_110","PuckLayout--rightSideBarVisible":"_PuckLayout--rightSideBarVisible_tzaxg_137","PuckLayout-mounted":"_PuckLayout-mounted_tzaxg_156","PuckLayout-nav":"_PuckLayout-nav_tzaxg_197","PuckLayout-header":"_PuckLayout-header_tzaxg_217",PuckPluginTab:"_PuckPluginTab_tzaxg_231","PuckPluginTab--visible":"_PuckPluginTab--visible_tzaxg_237","PuckPluginTab-body":"_PuckPluginTab-body_tzaxg_243"};(0,rF.init_react_import)();var pL=({children:e})=>(0,rV.jsx)(rV.Fragment,{children:e});(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var pB=(0,rw.get_class_name_factory_default)("MenuBar",{MenuBar:"_MenuBar_1hxnj_1","MenuBar--menuOpen":"_MenuBar--menuOpen_1hxnj_14","MenuBar-inner":"_MenuBar-inner_1hxnj_29","MenuBar-history":"_MenuBar-history_1hxnj_45"});function pR({menuOpen:e=!1,renderHeaderActions:t,setMenuOpen:r}){let n=(0,rB.useAppStore)(e=>e.history.back),o=(0,rB.useAppStore)(e=>e.history.forward),i=(0,rB.useAppStore)(e=>e.history.hasFuture()),a=(0,rB.useAppStore)(e=>e.history.hasPast()),l=(0,rB.useMessage)("header-undo"),s=(0,rB.useMessage)("header-redo");return(0,rV.jsx)("div",{className:pB({menuOpen:e}),onClick:e=>{var t;let n=e.target;!window.matchMedia("(min-width: 638px)").matches&&"A"===n.tagName&&(null==(t=n.getAttribute("href"))?void 0:t.startsWith("#"))&&r(!1)},children:(0,rV.jsxs)("div",{className:pB("inner"),children:[(0,rV.jsxs)("div",{className:pB("history"),children:[(0,rV.jsx)(rB.IconButton,{type:"button",title:l,disabled:!a,onClick:n,children:(0,rV.jsx)(rB.Undo2,{size:21})}),(0,rV.jsx)(rB.IconButton,{type:"button",title:s,disabled:!i,onClick:o,children:(0,rV.jsx)(rB.Redo2,{size:21})})]}),(0,rV.jsx)(rV.Fragment,{children:t&&t()})]})})}(0,rF.init_react_import)();var pF=(0,rw.get_class_name_factory_default)("PuckHeader",{PuckHeader:"_PuckHeader_c2nei_1","PuckHeader--hidePlugins":"_PuckHeader--hidePlugins_c2nei_21","PuckHeader-inner":"_PuckHeader-inner_c2nei_26","PuckHeader-toggle":"_PuckHeader-toggle_c2nei_46","PuckHeader-rightSideBarToggle":"_PuckHeader-rightSideBarToggle_c2nei_52","PuckHeader-leftSideBarToggle":"_PuckHeader-leftSideBarToggle_c2nei_53","PuckHeader-title":"_PuckHeader-title_c2nei_64","PuckHeader-path":"_PuckHeader-path_c2nei_68","PuckHeader-tools":"_PuckHeader-tools_c2nei_75","PuckHeader-menuButton":"_PuckHeader-menuButton_c2nei_81","PuckHeader--menuOpen":"_PuckHeader--menuOpen_c2nei_86"}),pV=(0,r_.memo)(({hidePlugins:e})=>{let{onPublish:t,renderHeader:r,renderHeaderActions:n,headerTitle:o,headerPath:i,iframe:a}=hh(),l=(0,rB.useAppStore)(e=>e.dispatch),s=(0,rB.useAppStoreApi)(),c=(0,r_.useMemo)(()=>r?(console.warn("`renderHeader` is deprecated. Please use `overrides.header` and the `usePuck` hook instead"),e=>{var{actions:t}=e,n=(0,rF.__objRest)(e,["actions"]);let o=(0,rB.useAppStore)(e=>e.state);return(0,rV.jsx)(r,(0,rF.__spreadProps)((0,rF.__spreadValues)({},n),{dispatch:l,state:o,children:t}))}):pL,[r]),u=(0,r_.useMemo)(()=>n?(console.warn("`renderHeaderActions` is deprecated. Please use `overrides.headerActions` and the `usePuck` hook instead."),e=>{let t=(0,rB.useAppStore)(e=>e.state);return(0,rV.jsx)(n,(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{dispatch:l,state:t}))}):pL,[n]),d=(0,rB.useAppStore)(e=>e.overrides.header||c),p=(0,rB.useAppStore)(e=>e.overrides.headerActions||u),[h,f]=(0,r_.useState)(!1),v=(0,rB.useAppStore)(e=>{var t,r;return null!=(r=(null==(t=e.state.indexes.nodes.root)?void 0:t.data).props.title)?r:""}),g=(0,rB.useAppStore)(e=>e.state.ui.leftSideBarVisible),m=(0,rB.useAppStore)(e=>e.state.ui.rightSideBarVisible),_=(0,r_.useCallback)(e=>{let t=window.matchMedia("(min-width: 638px)").matches,r="left"===e?g:m;l({type:"setUi",ui:(0,rF.__spreadValues)({[`${e}SideBarVisible`]:!r},t?{}:{["left"===e?"rightSideBarVisible":"leftSideBarVisible"]:!1})})},[l,g,m]),b=(0,rB.useMessage)("header-publish"),y=(0,rB.useMessage)("label-page"),k=(0,rB.useMessage)("header-toggle-leftsidebar"),w=(0,rB.useMessage)("header-toggle-rightsidebar"),S=(0,rB.useMessage)("header-toggle-menubar");return(0,rV.jsx)(d,{actions:(0,rV.jsx)(rV.Fragment,{children:(0,rV.jsx)(p,{children:(0,rV.jsx)(cl,{onClick:()=>{let e=s.getState().state.data;t&&t(e)},icon:(0,rV.jsx)(rB.Globe,{size:"14px"}),children:b})})}),children:(0,rV.jsx)("header",{className:pF({leftSideBarVisible:g,rightSideBarVisible:m,hidePlugins:e}),children:(0,rV.jsxs)("div",{className:pF("inner"),children:[(0,rV.jsxs)("div",{className:pF("toggle"),children:[(0,rV.jsx)("div",{className:pF("leftSideBarToggle"),children:(0,rV.jsx)(rB.IconButton,{type:"button",onClick:()=>{_("left")},title:k,children:(0,rV.jsx)(rB.PanelLeft,{focusable:"false"})})}),(0,rV.jsx)("div",{className:pF("rightSideBarToggle"),children:(0,rV.jsx)(rB.IconButton,{type:"button",onClick:()=>{_("right")},title:w,children:(0,rV.jsx)(rB.PanelRight,{focusable:"false"})})})]}),(0,rV.jsx)("div",{className:pF("title"),children:(0,rV.jsxs)(cQ,{rank:"2",size:"xs",children:[o||v||y,i&&(0,rV.jsxs)(rV.Fragment,{children:[" ",(0,rV.jsx)("code",{className:pF("path"),children:i})]})]})}),(0,rV.jsxs)("div",{className:pF("tools"),children:[(0,rV.jsx)("div",{className:pF("menuButton"),children:(0,rV.jsx)(rB.IconButton,{type:"button",onClick:()=>f(!h),title:S,children:h?(0,rV.jsx)(rB.ChevronUp,{focusable:"false"}):(0,rV.jsx)(rB.ChevronDown,{focusable:"false"})})}),(0,rV.jsx)(pR,{dispatch:l,onPublish:t,menuOpen:h,renderHeaderActions:()=>(0,rV.jsx)(p,{children:(0,rV.jsx)(cl,{onClick:()=>{let e=s.getState().state.data;t&&t(e)},icon:(0,rV.jsx)(rB.Globe,{size:"14px"}),children:b})}),setMenuOpen:f})]})]})})})});(0,rF.init_react_import)(),(0,rF.init_react_import)();var p$=(0,rw.get_class_name_factory_default)("SidebarSection",{SidebarSection:"_SidebarSection_1uv88_1","SidebarSection-title":"_SidebarSection-title_1uv88_12","SidebarSection--noBorderTop":"_SidebarSection--noBorderTop_1uv88_20","SidebarSection-content":"_SidebarSection-content_1uv88_24","SidebarSection-breadcrumbLabel":"_SidebarSection-breadcrumbLabel_1uv88_33","SidebarSection-breadcrumbs":"_SidebarSection-breadcrumbs_1uv88_62","SidebarSection-breadcrumb":"_SidebarSection-breadcrumb_1uv88_33","SidebarSection-heading":"_SidebarSection-heading_1uv88_74","SidebarSection-loadingOverlay":"_SidebarSection-loadingOverlay_1uv88_78"}),pW=({children:e,title:t,background:r,showBreadcrumbs:n,noBorderTop:o,isLoading:i})=>(0,rV.jsxs)("div",{className:p$({noBorderTop:o}),style:{background:r},children:[(0,rV.jsx)("div",{className:p$("title"),children:(0,rV.jsxs)("div",{className:p$("breadcrumbs"),children:[n&&(0,rV.jsx)(pl,{}),(0,rV.jsx)("div",{className:p$("heading"),children:(0,rV.jsx)(cQ,{rank:"2",size:"xs",children:t})})]})}),(0,rV.jsx)("div",{className:p$("content"),children:e}),i&&(0,rV.jsx)("div",{className:p$("loadingOverlay"),children:(0,rV.jsx)(rB.Loader,{size:32})})]});(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var pH={ViewportControls:"_ViewportControls_v26yb_1","ViewportControls--fullScreen":"_ViewportControls--fullScreen_v26yb_5","ViewportControls-toggleButton":"_ViewportControls-toggleButton_v26yb_14","ViewportControls-actions":"_ViewportControls-actions_v26yb_39","ViewportControls-actionsInner":"_ViewportControls-actionsInner_v26yb_43","ViewportControls--isExpanded":"_ViewportControls--isExpanded_v26yb_67","ViewportControls-divider":"_ViewportControls-divider_v26yb_72","ViewportControls-zoomSelect":"_ViewportControls-zoomSelect_v26yb_79","ViewportControls-zoom":"_ViewportControls-zoom_v26yb_79","ViewportButton-inner":"_ViewportButton-inner_v26yb_110","ViewportButton--isActive":"_ViewportButton--isActive_v26yb_118"},pq={Smartphone:(0,rV.jsx)(rB.Smartphone,{size:16}),Tablet:(0,rV.jsx)(rB.Tablet,{size:16}),Monitor:(0,rV.jsx)(rB.Monitor,{size:16}),FullWidth:(0,rV.jsx)(rB.Expand,{size:16})},pU=(0,rw.get_class_name_factory_default)("ViewportControls",pH),pZ=(0,rw.get_class_name_factory_default)("ViewportButton",pH),pY=({children:e,title:t,onClick:r,isActive:n,disabled:o})=>(0,rV.jsx)("span",{className:pZ({isActive:n}),suppressHydrationWarning:!0,children:(0,rV.jsx)(rB.IconButton,{type:"button",title:t,disabled:o||n,onClick:r,suppressHydrationWarning:!0,children:(0,rV.jsx)("span",{className:pZ("inner"),children:e})})}),pX=[{label:"25%",value:.25},{label:"50%",value:.5},{label:"75%",value:.75},{label:"100%",value:1},{label:"125%",value:1.25},{label:"150%",value:1.5},{label:"200%",value:2}],pK=({viewport:e,isActive:t,onClick:r})=>{var n;let o=(0,rB.useMessage)("viewport-switch",{label:null!=(n=e.label)?n:""}),i=(0,rB.useMessage)("viewport-switch-default");return(0,rV.jsx)(pY,{title:e.label?o:i,onClick:r,isActive:t,children:"string"==typeof e.icon?pq[e.icon]||e.icon:e.icon||pq.Smartphone})},pJ=({autoZoom:e,zoom:t,onViewportChange:r,onZoom:n,fullScreen:o})=>{var i,a;let l=(0,rB.useAppStore)(e=>e.viewports),s=(0,rB.useAppStore)(e=>e.state.ui.viewports),c=pX.find(t=>t.value===e),u=(0,rB.useMessage)("viewport-zoom-auto",{zoom:(100*e).toFixed(0)}),d=(0,r_.useMemo)(()=>[...pX,...c?[]:[{value:e,label:u}]].filter(t=>t.value<=e).sort((e,t)=>e.value>t.value?1:-1),[e,u]),[p,h]=(0,r_.useState)(s.current.width);(0,r_.useEffect)(()=>{h(s.current.width)},[s.current]);let[f,v]=(0,r_.useState)(!1),g=(0,rB.useMessage)("viewport-zoom-out"),m=(0,rB.useMessage)("viewport-zoom-in"),_=(0,rB.useMessage)("viewport-toggle-menu");return(0,rV.jsxs)("div",{className:pU({isExpanded:f,fullScreen:o}),suppressHydrationWarning:!0,children:[(0,rV.jsx)("div",{className:pU("actions"),children:(0,rV.jsxs)("div",{className:pU("actionsInner"),children:[l.map((e,t)=>(0,rV.jsx)(pK,{viewport:e,onClick:()=>{h(e.width),r(e)},isActive:p===e.width},t)),(0,rV.jsx)("div",{className:pU("divider")}),(0,rV.jsx)(pY,{title:g,disabled:t<=(null==(i=d[0])?void 0:i.value),onClick:e=>{e.stopPropagation(),n(d[Math.max(d.findIndex(e=>e.value===t)-1,0)].value)},children:(0,rV.jsx)(rB.ZoomOut,{size:16})}),(0,rV.jsx)(pY,{title:m,disabled:t>=(null==(a=d[d.length-1])?void 0:a.value),onClick:e=>{e.stopPropagation(),n(d[Math.min(d.findIndex(e=>e.value===t)+1,d.length-1)].value)},children:(0,rV.jsx)(rB.ZoomIn,{size:16})}),(0,rV.jsxs)("div",{className:pU("zoom"),children:[(0,rV.jsx)("div",{className:pU("divider")}),(0,rV.jsx)("select",{className:pU("zoomSelect"),value:t.toString(),onClick:e=>{e.stopPropagation()},onChange:e=>{n(parseFloat(e.currentTarget.value))},children:d.map(e=>(0,rV.jsx)("option",{value:e.value,label:e.label},e.label))})]})]})}),(0,rV.jsx)("button",{className:pU("toggleButton"),title:_,onClick:()=>v(e=>!e),children:f?(0,rV.jsx)(rB.X,{size:16}):(0,rV.jsx)(rB.Monitor,{size:16})})]})};(0,rF.init_react_import)(),(0,rF.init_react_import)();var pG=(0,r_.createContext)(null),pQ=({children:e})=>{let t=(0,r_.useRef)(null),r=(0,r_.useMemo)(()=>({frameRef:t}),[]);return(0,rV.jsx)(pG.Provider,{value:r,children:e})},p0=()=>{let e=(0,r_.useContext)(pG);if(null===e)throw Error("useCanvasFrame must be used within a FrameProvider");return e},p1=(0,rw.get_class_name_factory_default)("PuckCanvas",{PuckCanvas:"_PuckCanvas_zw9iy_1","PuckCanvas-controls":"_PuckCanvas-controls_zw9iy_18","PuckCanvas--fullScreen":"_PuckCanvas--fullScreen_zw9iy_23","PuckCanvas-inner":"_PuckCanvas-inner_zw9iy_34","PuckCanvas-root":"_PuckCanvas-root_zw9iy_43","PuckCanvas--ready":"_PuckCanvas--ready_zw9iy_68","PuckCanvas-loader":"_PuckCanvas-loader_zw9iy_73","PuckCanvas--showLoader":"_PuckCanvas--showLoader_zw9iy_84"}),p2=()=>{var e;let{frameRef:t}=p0(),r=(0,rB.useResetAutoZoom)(t),{viewports:n=rk.defaultViewports,ui:o}=hh(),{dispatch:i,overrides:a,setUi:l,zoomConfig:s,setZoomConfig:c,status:u,iframe:d,_experimentalFullScreenCanvas:p}=(0,rB.useAppStore)(rW(e=>({dispatch:e.dispatch,overrides:e.overrides,setUi:e.setUi,zoomConfig:e.zoomConfig,setZoomConfig:e.setZoomConfig,status:e.status,iframe:e.iframe,_experimentalFullScreenCanvas:e._experimentalFullScreenCanvas}))),{leftSideBarVisible:h,rightSideBarVisible:f,leftSideBarWidth:v,rightSideBarWidth:g,viewports:m}=(0,rB.useAppStore)(rW(e=>({leftSideBarVisible:e.state.ui.leftSideBarVisible,rightSideBarVisible:e.state.ui.rightSideBarVisible,leftSideBarWidth:e.state.ui.leftSideBarWidth,rightSideBarWidth:e.state.ui.rightSideBarWidth,viewports:e.state.ui.viewports}))),[_,b]=(0,r_.useState)(!1),y=(0,r_.useRef)(!1),k=(0,r_.useMemo)(()=>({children:e})=>(0,rV.jsx)(rV.Fragment,{children:e}),[]),w=(0,r_.useMemo)(()=>a.preview||k,[a]),S=(0,r_.useCallback)(()=>{if(t.current){let e=t.current,r=(0,rB.getBox)(e);return{width:r.contentBox.width,height:r.contentBox.height}}return{width:0,height:0}},[t]);(0,r_.useEffect)(()=>{r()},[t,h,f,v,g,m]),(0,r_.useEffect)(()=>{let{height:e}=S();"auto"===m.current.height&&c((0,rF.__spreadProps)((0,rF.__spreadValues)({},s),{rootHeight:e/s.zoom}))},[s.zoom,S,c]),(0,r_.useEffect)(()=>{r()},[m.current.width,m]),(0,r_.useEffect)(()=>{if(!t.current)return;let e=new ResizeObserver(()=>{y.current||r()});return e.observe(t.current),()=>{e.disconnect()}},[t.current]);let[I,j]=(0,r_.useState)(!1);(0,r_.useEffect)(()=>{setTimeout(()=>{j(!0)},500)},[]);let z=(0,rB.useAppStoreApi)();return(0,r_.useEffect)(()=>{var e,r;if("u"<typeof window||(null==(e=null==o?void 0:o.viewports)?void 0:e.current))return;let i=window.innerWidth,a=null==(r=t.current)?void 0:r.getBoundingClientRect().width;if(!i||!a||0===n.length)return;let l=Object.values(n).find(e=>"100%"===e.width),s=Object.entries(n).filter(([e,t])=>"100%"!==t.width).map(([e,t])=>({key:e,diff:Math.abs(i-("string"==typeof t.width?i:t.width)),value:t})).sort((e,t)=>e.diff>t.diff?1:-1)[0].value;if(s.width<a&&l&&(s=l),d.enabled){let e=z.getState(),t={state:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e.state),{ui:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e.state.ui),{viewports:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e.state.ui.viewports),{current:(0,rF.__spreadProps)((0,rF.__spreadValues)({},e.state.ui.viewports.current),{height:(null==s?void 0:s.height)||"auto",width:null==s?void 0:s.width})})})})},r=e.history;1===e.history.histories.length&&(r=(0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{histories:[t]})),z.setState((0,rF.__spreadProps)((0,rF.__spreadValues)({},t),{history:r}))}},[n,t.current,d,z,null==(e=null==o?void 0:o.viewports)?void 0:e.current]),(0,rV.jsxs)("div",{className:p1({ready:"READY"===u||!d.enabled||!d.waitForStyles,showLoader:I,fullScreen:p}),onClick:e=>{let t=e.target;t.hasAttribute("data-puck-component")||t.hasAttribute("data-puck-dropzone")||i({type:"setUi",ui:{itemSelector:null},recordHistory:!1})},children:[m.controlsVisible&&d.enabled&&(0,rV.jsx)("div",{className:p1("controls"),children:(0,rV.jsx)(pJ,{fullScreen:p,autoZoom:s.autoZoom,zoom:s.zoom,onViewportChange:e=>{b(!0),y.current=!0;let t=(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{height:e.height||"auto",zoom:s.zoom});l({viewports:(0,rF.__spreadProps)((0,rF.__spreadValues)({},m),{current:t})}),r({viewports:(0,rF.__spreadProps)((0,rF.__spreadValues)({},m),{current:t})})},onZoom:e=>{b(!0),y.current=!0,c((0,rF.__spreadProps)((0,rF.__spreadValues)({},s),{zoom:e}))}})}),(0,rV.jsxs)("div",{className:p1("inner"),ref:t,children:[(0,rV.jsx)("div",{className:p1("root"),style:{width:d.enabled?m.current.width:"100%",height:s.rootHeight,transform:d.enabled?`scale(${s.zoom})`:void 0,transition:_?"width 150ms ease-out, height 150ms ease-out, transform 150ms ease-out":"",overflow:d.enabled?void 0:"auto"},suppressHydrationWarning:!0,id:"puck-canvas-root",onTransitionEnd:()=>{b(!1),y.current=!1},children:(0,rV.jsx)(w,{children:(0,rV.jsx)(pT,{})})}),(0,rV.jsx)("div",{className:p1("loader"),children:(0,rV.jsx)(rB.Loader,{size:24})})]})]})};function p4(e,t){let[r,n]=(0,r_.useState)(null),o=(0,r_.useRef)(null),i=(0,rB.useAppStore)(t=>"left"===e?t.state.ui.leftSideBarWidth:t.state.ui.rightSideBarWidth);return(0,r_.useEffect)(()=>{if("u">typeof window&&!i)try{let r=localStorage.getItem("puck-sidebar-widths");if(r){let n=JSON.parse(r)[e],o="left"===e?"leftSideBarWidth":"rightSideBarWidth";n&&t({type:"setUi",ui:{[o]:n}})}}catch(t){console.error(`Failed to load ${e} sidebar width from localStorage`,t)}},[t,e,i]),(0,r_.useEffect)(()=>{void 0!==i&&n(i)},[i]),{width:r,setWidth:n,sidebarRef:o,handleResizeEnd:(0,r_.useCallback)(r=>{t({type:"setUi",ui:{["left"===e?"leftSideBarWidth":"rightSideBarWidth"]:r}});let n={};try{let e=localStorage.getItem("puck-sidebar-widths");n=e?JSON.parse(e):{}}catch(t){console.error(`Failed to save ${e} sidebar width to localStorage`,t)}finally{localStorage.setItem("puck-sidebar-widths",JSON.stringify((0,rF.__spreadProps)((0,rF.__spreadValues)({},n),{[e]:r})))}window.dispatchEvent(new CustomEvent("viewportchange",{bubbles:!0,cancelable:!1}))},[t,e])}}(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var p3=(0,rw.get_class_name_factory_default)("ResizeHandle",{ResizeHandle:"_ResizeHandle_144bf_2","ResizeHandle--left":"_ResizeHandle--left_144bf_16","ResizeHandle--right":"_ResizeHandle--right_144bf_20"}),p6=({position:e,sidebarRef:t,onResize:r,onResizeEnd:n})=>{let{frameRef:o}=p0(),i=(0,rB.useResetAutoZoom)(o),a=(0,r_.useRef)(null),l=(0,r_.useRef)(!1),s=(0,r_.useRef)(0),c=(0,r_.useRef)(0),u=(0,r_.useCallback)(t=>{if(!l.current)return;let n=t.clientX-s.current;r(Math.max(192,"left"===e?c.current+n:c.current-n)),t.preventDefault()},[r,e]),d=(0,r_.useCallback)(()=>{var e;if(!l.current)return;l.current=!1,document.body.style.cursor="",document.body.style.userSelect="";let r=document.getElementById("resize-overlay");r&&document.body.removeChild(r),document.removeEventListener("mousemove",u),document.removeEventListener("mouseup",d),n((null==(e=t.current)?void 0:e.getBoundingClientRect().width)||0),i()},[n]),p=(0,r_.useCallback)(e=>{var r;l.current=!0,s.current=e.clientX,c.current=(null==(r=t.current)?void 0:r.getBoundingClientRect().width)||0,document.body.style.cursor="col-resize",document.body.style.userSelect="none";let n=document.createElement("div");n.id="resize-overlay",n.setAttribute("data-resize-overlay",""),document.body.appendChild(n),document.addEventListener("mousemove",u),document.addEventListener("mouseup",d),e.preventDefault()},[e,u,d]);return(0,rV.jsx)("div",{ref:a,className:p3({[e]:!0}),onMouseDown:p})};(0,rF.init_react_import)();var p5=(0,rw.get_class_name_factory_default)("Sidebar",{Sidebar:"_Sidebar_16oed_1","Sidebar--isVisible":"_Sidebar--isVisible_16oed_10","Sidebar--left":"_Sidebar--left_16oed_14","Sidebar--right":"_Sidebar--right_16oed_34","Sidebar-resizeHandle":"_Sidebar-resizeHandle_16oed_51"}),p8=({position:e,sidebarRef:t,isVisible:r,onResize:n,onResizeEnd:o,children:i})=>(0,rV.jsxs)(rV.Fragment,{children:[(0,rV.jsx)("div",{ref:t,className:p5({[e]:!0,isVisible:r}),children:i}),(0,rV.jsx)("div",{className:`${p5("resizeHandle")}`,children:(0,rV.jsx)(p6,{position:e,sidebarRef:t,onResize:n,onResizeEnd:o})})]});(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)();var p9={Nav:"_Nav_vll2r_1","Nav-list":"_Nav-list_vll2r_5","Nav-mobileActions":"_Nav-mobileActions_vll2r_23","NavItem-link":"_NavItem-link_vll2r_39",NavItem:"_NavItem_vll2r_39","NavItem-linkIcon":"_NavItem-linkIcon_vll2r_90","NavItem--active":"_NavItem--active_vll2r_100","NavItem--mobileOnly":"_NavItem--mobileOnly_vll2r_136","NavItem--desktopOnly":"_NavItem--desktopOnly_vll2r_141"},p7=(0,rw.get_class_name_factory_default)("Nav",p9),he=(0,rw.get_class_name_factory_default)("NavItem",p9),ht=({label:e,icon:t,onClick:r,isActive:n,mobileOnly:o,desktopOnly:i})=>(0,rV.jsx)("li",{className:he({active:n,mobileOnly:o,desktopOnly:i}),children:r&&(0,rV.jsxs)("div",{className:he("link"),onClick:r,children:[t&&(0,rV.jsx)("span",{className:he("linkIcon"),children:t}),(0,rV.jsx)("span",{className:he("linkLabel"),children:e})]})}),hr=({items:e,mobileActions:t})=>(0,rV.jsxs)("nav",{className:p7(),children:[(0,rV.jsx)("ul",{className:p7("list"),children:Object.entries(e).map(([e,t])=>(0,rV.jsx)(ht,(0,rF.__spreadValues)({},t),e))}),t&&(0,rV.jsx)("div",{className:p7("mobileActions"),children:t})]});(0,rF.init_react_import)();var hn=e=>(0,rF.__spreadValues)({enabled:!0,waitForStyles:!0,syncHostStyles:!0},e),ho=(0,rw.get_class_name_factory_default)("Puck",pN),hi=(0,rw.get_class_name_factory_default)("PuckLayout",pN),ha=(0,rw.get_class_name_factory_default)("PuckPluginTab",pN),hl="u"<typeof window?r_.useEffect:r_.useLayoutEffect,hs=()=>{let e=(0,rB.useMessage)("label-page"),t=(0,rB.useAppStore)(e=>{var t,r,n;return e.selectedItem?null!=(r=null==(t=e.config.components[e.selectedItem.type])?void 0:t.label)?r:e.selectedItem.type.toString():null==(n=e.config.root)?void 0:n.label});return(0,rV.jsx)(pW,{noBorderTop:!0,showBreadcrumbs:!0,title:t||e,children:(0,rV.jsx)(pp,{})})},hc=({children:e,visible:t,mobileOnly:r})=>(0,rV.jsx)("div",{className:ha({visible:t,mobileOnly:r}),children:(0,rV.jsx)("div",{className:ha("body"),children:e})}),hu=({children:e})=>{var t,r;let n,o,i,a,{iframe:l,initialHistory:s,plugins:c,height:u}=hh(),d=(0,rB.useAppStore)(e=>e.dnd),p=(0,r_.useMemo)(()=>hn(l),[l]);py((null!==pk?pk:!("u"<typeof document)&&(pk=""!==getComputedStyle(document.documentElement).getPropertyValue("--_puck-styles-loaded").trim()))?null:{cssText:pv,id:"ui-default",prepend:!0}),(0,r_.useEffect)(()=>{},[]);let h=(0,rB.useAppStore)(e=>e.dispatch),f=(0,rB.useAppStore)(e=>e.state.ui.leftSideBarVisible),v=(0,rB.useAppStore)(e=>e.state.ui.rightSideBarVisible),g=(0,rB.useAppStore)(e=>e.instanceId),{width:m,setWidth:_,sidebarRef:b,handleResizeEnd:y}=p4("left",h),{width:k,setWidth:w,sidebarRef:S,handleResizeEnd:I}=p4("right",h);(0,r_.useEffect)(()=>{window.matchMedia("(min-width: 638px)").matches||h({type:"setUi",ui:{leftSideBarVisible:!1,rightSideBarVisible:!1}});let e=()=>{window.matchMedia("(min-width: 638px)").matches||h({type:"setUi",ui:e=>(0,rF.__spreadValues)((0,rF.__spreadValues)({},e),e.rightSideBarVisible?{leftSideBarVisible:!1}:{})})};return window.addEventListener("resize",e),()=>{window.removeEventListener("resize",e)}},[]);let j=(0,rB.useAppStore)(e=>e.overrides),z=(0,r_.useMemo)(()=>j.puck||pL,[j]),[E,C]=(0,r_.useState)(!1);hl(()=>{C(!0)},[]);let A=(0,rB.useAppStore)(e=>"READY"===e.status);(0,rB.useMonitorHotkeys)(),(0,r_.useEffect)(()=>{if(A&&p.enabled){let e=uv();if(e)return(0,rB.monitorHotkeys)(e)}},[A,p.enabled]),n=(0,rB.useAppStoreApi)(),o=(0,r_.useCallback)(()=>{(0,n.getState().dispatch)({type:"setUi",ui:e=>({previewMode:"edit"===e.previewMode?"interactive":"edit"})})},[n]),(0,rB.useHotkey)({meta:!0,i:!0},o),(0,rB.useHotkey)({ctrl:!0,i:!0},o),i=(0,rB.useAppStoreApi)(),a=(0,r_.useCallback)(e=>{var t;if((e=>{var t;if(null==e?void 0:e.defaultPrevented)return!0;let r=(null==(t=null==e?void 0:e.composedPath)?void 0:t.call(e)[0])||(null==e?void 0:e.target)||document.activeElement;if(r instanceof HTMLElement){let e=r.tagName.toLowerCase();if("input"===e||"textarea"===e||"select"===e||r.isContentEditable)return!0;let t=r.getAttribute("role");if("textbox"===t||"combobox"===t||"searchbox"===t||"listbox"===t||"grid"===t)return!0}let n=document.querySelector('dialog[open], [aria-modal="true"], [role="dialog"], [role="alertdialog"]');return!!(n&&(e=>{let t=e;for(;t&&t!==document.body;){let e=window.getComputedStyle(t);if("none"===e.display||"hidden"===e.visibility||"0"===e.opacity||"true"===t.getAttribute("aria-hidden")||t.hasAttribute("hidden"))return!1;t=t.parentElement}return!0})(n))})(e))return!1;let{state:r,dispatch:n,permissions:o,selectedItem:a}=i.getState(),l=null==(t=r.ui)?void 0:t.itemSelector;return null==l||!l.zone||!a||!o.getPermissions({item:a}).delete||(n({type:"remove",index:l.index,zone:l.zone}),!0)},[i]),(0,rB.useHotkey)({delete:!0},a),(0,rB.useHotkey)({backspace:!0},a);let P={};m&&(P["--puck-user-sidebar-left-width"]=`${m}px`),k&&(P["--puck-user-sidebar-right-width"]=`${k}px`);let M=(0,rB.useAppStore)(e=>e.setUi),O=(0,rB.useAppStore)(e=>{var t;return null==(t=e.state.ui.plugin)?void 0:t.current}),D=(0,rB.useAppStoreApi)(),T=(0,r_.useMemo)(()=>!!(null==c?void 0:c.find(e=>"legacy-side-bar"===e.name)),[c]),N=(0,rB.useMessage)("plugin-blocks"),L=(0,rB.useMessage)("plugin-outline"),B=(0,rB.useMessage)("plugin-fields"),R=(0,r_.useMemo)(()=>{let e={},t=[((e={})=>{var t,r;return{name:"blocks",label:null!=(t=e.label)?t:"Blocks",render:()=>(0,rV.jsx)("div",{className:dI(),children:(0,rV.jsx)(dS,{})}),icon:null!=(r=e.icon)?r:(0,rV.jsx)(rB.Hammer,{})}})({label:N}),((e={})=>{var t,r;return{name:"outline",label:null!=(t=e.label)?t:"Outline",render:()=>(0,rV.jsx)("div",{className:pi(),children:(0,rV.jsx)(po,{})}),icon:null!=(r=e.icon)?r:(0,rV.jsx)(rB.Layers,{})}})({label:L})],r=e=>"legacy-side-bar"===e.name?-1:0,n=[...t,...null!=c?c:[]].sort((e,t)=>r(e)-r(t));return(null==c?void 0:c.some(e=>"fields"===e.name))||n.push((({desktopSideBar:e="right",label:t,icon:r}={})=>({name:"fields",label:null!=t?t:"Fields",render:()=>(0,rV.jsxs)("div",{className:ph(),children:[(0,rV.jsx)("div",{className:ph("header"),children:(0,rV.jsx)(pl,{numParents:2,children:(0,rV.jsx)(pf,{})})}),(0,rV.jsx)(pp,{})]}),icon:null!=r?r:(0,rV.jsx)(rB.RectangleEllipsis,{}),mobileOnly:"right"===e}))({label:B})),null==n||n.forEach(t=>{var r,n,o;t.name&&t.render&&(e[t.name]&&delete e[t.name],e[t.name]={label:null!=(r=t.label)?r:t.name,icon:null!=(n=t.icon)?n:(0,rV.jsx)(rB.ToyBrick,{}),onClick:()=>{t.name===O?f?M({leftSideBarVisible:!1}):M({leftSideBarVisible:!0}):t.name&&M({plugin:{current:t.name},leftSideBarVisible:!0})},isActive:f&&O===t.name,render:t.render,mobilePanelHeight:null!=(o=t.mobilePanelHeight)?o:"toggle",mobileOnly:T||t.mobileOnly,desktopOnly:"legacy-side-bar"===t.name||t.desktopOnly})}),e},[c,O,D,f,N,L,B]),F=null!=O?O:Object.keys(R)[0],V=null!=(r=null==(t=R[F])?void 0:t.mobilePanelHeight)?r:"toggle";(0,r_.useEffect)(()=>{O||M({plugin:{current:Object.keys(R)[0]}})},[R,O]);let $=R.fields&&!1===R.fields.mobileOnly,W=(0,rB.useAppStore)(e=>{var t;return null!=(t=e.state.ui.mobilePanelExpanded)&&t}),H=(0,rB.useMessage)("layout-maximize"),q=(0,rB.useMessage)("layout-minimize");return(0,rV.jsxs)("div",{className:`Puck ${ho({hidePlugins:T})}`,id:g,style:{height:u,visibility:"hidden"},children:[(0,rV.jsx)(uY,{disableAutoScroll:null==d?void 0:d.disableAutoScroll,behavior:null==d?void 0:d.behavior,children:(0,rV.jsx)(z,{children:e||(0,rV.jsx)(pQ,{children:(0,rV.jsx)("div",{className:hi({leftSideBarVisible:f,mounted:E,rightSideBarVisible:!$&&v,isExpanded:W,mobilePanelHeightToggle:"toggle"===V,mobilePanelHeightMinContent:"min-content"===V}),style:{height:u},children:(0,rV.jsxs)("div",{className:hi("inner"),style:P,children:[(0,rV.jsx)("div",{className:hi("header"),children:(0,rV.jsx)(pV,{hidePlugins:T})}),(0,rV.jsx)("div",{className:hi("nav"),children:(0,rV.jsx)(hr,{items:R,mobileActions:f&&"toggle"===V&&(0,rV.jsx)(rB.IconButton,{type:"button",title:W?q:H,onClick:()=>{M({mobilePanelExpanded:!W})},children:W?(0,rV.jsx)(rB.Minimize2,{size:21}):(0,rV.jsx)(rB.Maximize2,{size:21})})})}),(0,rV.jsx)(p8,{position:"left",sidebarRef:b,isVisible:f,onResize:_,onResizeEnd:y,children:Object.entries(R).map(([e,{mobileOnly:t,render:r,label:n}])=>(0,rV.jsx)(hc,{visible:O===e,mobileOnly:t,children:(0,rV.jsx)(r,{})},e))}),(0,rV.jsx)(p2,{}),!$&&(0,rV.jsx)(p8,{position:"right",sidebarRef:S,isVisible:v,onResize:w,onResizeEnd:I,children:(0,rV.jsx)(hs,{})})]})})})})}),(0,rV.jsx)("div",{id:"puck-portal-root",className:ho("portal")})]})},hd=(0,r_.createContext)({});function hp(e){return(0,rV.jsx)(hd.Provider,{value:e,children:e.children})}var hh=()=>(0,r_.useContext)(hd);function hf({children:e}){let{config:t,data:r,ui:n,onChange:o,permissions:i={},plugins:a,overrides:l,viewports:s=rk.defaultViewports,iframe:c,dnd:u,initialHistory:d,metadata:p,dictionary:h,onAction:f,fieldTransforms:v,_experimentalFullScreenCanvas:g,_experimentalVirtualization:m}=hh(),_=(0,r_.useMemo)(()=>hn(c),[c]),[b]=(0,r_.useState)(()=>{var e,o,i;let a=(0,rF.__spreadValues)((0,rF.__spreadValues)({},rk.defaultAppState.ui),n);!(Object.keys((null==r?void 0:r.root)||{}).length>0)||(null==(e=null==r?void 0:r.root)?void 0:e.props)||console.warn("Warning: Defining props on `root` is deprecated. Please use `root.props`, or republish this page to migrate automatically.");let l=(null==(o=null==r?void 0:r.root)?void 0:o.props)||(null==r?void 0:r.root)||{},s=(0,rF.__spreadValues)((0,rF.__spreadValues)({},null==(i=t.root)?void 0:i.defaultProps),l),c=(0,rR.populateIds)((0,rS.toComponent)((0,rF.__spreadProps)((0,rF.__spreadValues)({},null==r?void 0:r.root),{props:s})),t),u=(0,rF.__spreadProps)((0,rF.__spreadValues)({},rk.defaultAppState),{data:(0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{root:(0,rF.__spreadProps)((0,rF.__spreadValues)({},null==r?void 0:r.root),{props:c.props}),content:r.content||[]}),ui:(0,rF.__spreadProps)((0,rF.__spreadValues)((0,rF.__spreadValues)({},a),{}),{componentList:t.categories?Object.entries(t.categories).reduce((e,[t,r])=>(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{[t]:{title:r.title,components:r.components,expanded:r.defaultExpanded,visible:r.visible}}),{}):{}})});return(0,rS.walkAppState)(u,t)}),{appendData:y=!0}=d||{},[k]=(0,r_.useState)([...(null==d?void 0:d.histories)||[],...y?[{state:b}]:[]].map(e=>{let r=(0,rF.__spreadValues)((0,rF.__spreadValues)({},b),e.state);return e.state.indexes||(r=(0,rS.walkAppState)(r,t)),(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{state:r})})),w=(0,r_.useMemo)(()=>(null==d?void 0:d.index)!==void 0&&(null==d?void 0:d.index)>=0&&(null==d?void 0:d.index)<k.length?null==d?void 0:d.index:k.length-1,[]),S=k[w].state,I=(({overrides:e,plugins:t})=>(0,r_.useMemo)(()=>(({overrides:e,plugins:t})=>{let r=(0,rF.__spreadValues)({},e);return null==t||t.forEach(e=>{e.overrides&&Object.keys(e.overrides).forEach(t=>{var n;if(!(null==(n=e.overrides)?void 0:n[t]))return;if("fieldTypes"===t){let t=e.overrides.fieldTypes;Object.keys(t).forEach(e=>{r.fieldTypes=r.fieldTypes||{};let n=r.fieldTypes[e];r.fieldTypes[e]=r=>t[e]((0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{children:n?n(r):r.children}))});return}let o=r[t];r[t]=r=>e.overrides[t]((0,rF.__spreadProps)((0,rF.__spreadValues)({},r),{children:o?o(r):r.children}))})}),r})({overrides:e,plugins:t}),[t,e]))({overrides:l,plugins:a}),j=(0,r_.useMemo)(()=>{let e=(a||[]).reduce((e,t)=>(0,rF.__spreadValues)((0,rF.__spreadValues)({},e),t.fieldTransforms),{});return(0,rF.__spreadValues)((0,rF.__spreadValues)({},e),v)},[v,a]),z=ut(),E=(0,r_.useCallback)(e=>({instanceId:z,state:e,config:t,plugins:a||[],overrides:I,viewports:s,iframe:_,_experimentalFullScreenCanvas:!!g,_experimentalVirtualization:!!m,onAction:f,metadata:p,dictionary:h||{},dnd:u,fieldTransforms:j}),[z,S,t,a,I,s,_,g,m,f,p,h,u,j]),[C]=(0,r_.useState)(()=>(0,rB.createAppStore)(E(S)));(0,r_.useEffect)(()=>{},[C]),(0,r_.useEffect)(()=>{let e=C.getState().state;C.setState((0,rF.__spreadValues)({},E(e)))},[E]),(0,rB.useRegisterHistorySlice)(C,{histories:k,index:w,initialAppState:S});let A=(0,r_.useRef)(null);(0,r_.useEffect)(()=>C.subscribe(e=>e.state.data,e=>{o&&((0,sY.deepEqual)(e,A.current)||(o(e),A.current=e))}),[o]),(0,rB.useRegisterPermissionsSlice)(C,i);let P=(e=>{let[t]=(0,r_.useState)(()=>(0,rH.createStore)(()=>d_(dx(e.getState()),e.getState)));return(0,r_.useEffect)(()=>e.subscribe(e=>dx(e),r=>{t.setState(d_(r,e.getState))}),[]),t})(C);return(0,r_.useEffect)(()=>{let{resolveAndCommitData:e}=C.getState();setTimeout(()=>{e()},0)},[]),(0,rV.jsx)(rB.appStoreContext.Provider,{value:C,children:(0,rV.jsx)(db.Provider,{value:P,children:e})})}function hv(e){return(0,rV.jsx)(hp,(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{children:(0,rV.jsx)(hf,(0,rF.__spreadProps)((0,rF.__spreadValues)({},e),{children:(0,rV.jsx)(hu,{children:e.children})}))}))}function hg(e){return e.main?"main":e.header?"header":e.footer?"footer":e.announcement?"announcement":e.cta?"cta":Object.keys(e)[0]??"main"}hv.Components=dS,hv.Fields=pp,hv.Layout=hu,hv.Outline=po,hv.Preview=pT,(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),(0,rF.init_react_import)(),e.i(925760),e.i(849957),e.i(50354),(0,rI.init_react_import)();let hm={id:"puck",version:"1.0.0",toEditor(e){let t=hg(e.slots);return{content:(e.slots[t]??[]).map(e=>({type:e.component,props:{...e.props,id:e.id}})),root:{props:{}}}},fromEditor(e,t){let r=structuredClone(e),n=hg(r.slots),o=new Set;return r.slots[n]=t.content.map(t=>{let r=String(t.props.id);if(!r||"undefined"===r||o.has(r))throw Error("Editor block ids must be unique.");o.add(r);let i=e.slots[n]?.find(e=>e.id===r),a={...t.props};return delete a.id,{...i,id:r,component:t.type,componentVersion:i?.component===t.type?i.componentVersion:1,props:a}}),r}};function h_(e){let t=(0,rm.resolveTheme)(e.themeId),r=e.slot??"main";return{version:1,siteId:e.siteId,theme:{id:t.id,version:t.version},template:{id:"layout",version:"1.0.0"},surface:"layout",slots:{[r]:e.blocks}}}function hb(e,t){let r=hm.fromEditor(h_(e),t);return{...e,blocks:r.slots[e.slot??"main"]??[],revision:e.revision+1}}function hx({value:e,onChange:t,kind:r,layoutId:n}){let[o,i]=(0,r_.useState)([]);return(0,r_.useEffect)(()=>{fetch(`/api/layouts/${n}/choices?kind=${r}`).then(e=>e.ok?e.json():{options:[]}).then(e=>i(Array.isArray(e.options)?e.options:[]))},[r,n]),(0,rg.jsxs)("select",{"aria-label":"media"===r?"Choose media from library":"Choose internal destination",value:e?.id??"",onChange:e=>t(o.find(t=>t.id===e.target.value)),children:[(0,rg.jsx)("option",{value:"",children:"Choose…"}),o.map(e=>(0,rg.jsx)("option",{value:e.id,children:e.label},e.id))]})}function hy({value:e,onChange:t}){let r={collection:"content",limit:6,sort:"newest",...e};return(0,rg.jsxs)("fieldset",{"aria-label":"Content query",style:{display:"grid",gap:8},children:[(0,rg.jsxs)("select",{value:String(r.collection),onChange:e=>t({...r,collection:e.target.value}),children:[(0,rg.jsx)("option",{value:"content",children:"Articles and pages"}),(0,rg.jsx)("option",{value:"events",children:"Events"}),(0,rg.jsx)("option",{value:"albums",children:"Albums"}),(0,rg.jsx)("option",{value:"discussions",children:"Discussions"})]}),(0,rg.jsxs)("select",{value:String(r.sort),onChange:e=>t({...r,sort:e.target.value}),children:[(0,rg.jsx)("option",{value:"newest",children:"Newest first"}),(0,rg.jsx)("option",{value:"oldest",children:"Oldest first"}),(0,rg.jsx)("option",{value:"title",children:"Title"})]}),(0,rg.jsx)("input",{"aria-label":"Maximum results",type:"number",min:1,max:24,value:Number(r.limit),onChange:e=>t({...r,limit:Number(e.target.value)})})]})}function hk({layout:e,onChange:t,onPublish:r}){let{id:n,siteId:o,themeId:i,slot:a="main"}=e,l=(0,r_.useMemo)(()=>{let e=(0,rm.resolveTheme)(i),t=function(e){let t=(0,rm.resolveTheme)(e.theme.id),r=(0,rm.resolveTemplate)(t,e.surface,e.template.id),n=hg(e.slots),o=new Set(r.slots[n]?.allowedComponents??[]),i=new Map;for(let e of Object.values(t.componentRegistry)){if(!o.has(e.id)||"publisher.editorial"===e.id)continue;let t=i.get(e.category)??[];t.push(e.id),i.set(e.category,t)}return[...i.entries()].map(([e,t])=>({id:e.toLowerCase().replaceAll(/[^a-z0-9]+/g,"-"),label:e,components:t}))}({version:1,siteId:o,theme:{id:e.id,version:e.version},template:{id:"layout",version:"1.0.0"},surface:"layout",slots:{[a]:[]}}),r=new Set(t.flatMap(e=>e.components));return{categories:Object.fromEntries(t.map(e=>[e.id,{title:e.label,components:e.components,defaultExpanded:"introduction"===e.id}])),components:Object.fromEntries(Object.values(e.componentRegistry).filter(e=>r.has(e.id)).map(e=>[e.id,{label:e.label,fields:Object.fromEntries(Object.entries(e.fields).map(([e,t])=>[e,"text"===t.type?{type:"text",label:t.label}:"long-text"===t.type?{type:"textarea",label:t.label}:"number"===t.type?{type:"number",label:t.label,min:t.min,max:t.max}:"boolean"===t.type?{type:"radio",label:t.label,options:[{label:"Yes",value:!0},{label:"No",value:!1}]}:"select"===t.type||"alignment"===t.type||"token"===t.type?{type:"select",label:t.label,options:t.options.map(e=>({label:e,value:e}))}:"content-query"===t.type?{type:"custom",label:t.label,render:({value:e,onChange:t})=>(0,rg.jsx)(hy,{value:e,onChange:t})}:{type:"custom",label:t.label,render:({value:e,onChange:r})=>(0,rg.jsx)(hx,{value:e,onChange:r,kind:t.type,layoutId:n})}])),defaultProps:{title:e.label,alignment:"left",spacing:"normal",variant:"default"},render:t=>e.render(t)}]))}},[n,o,i,a]);return(0,rg.jsx)(hv,{config:l,data:hm.toEditor(h_(e)),permissions:{drag:!0,duplicate:!0,delete:!0,edit:!0,insert:!0},onChange:r=>t(hb(e,r)),onPublish:t=>r(hb(e,t)),headerTitle:"Renegade visual editor",headerPath:`${e.surface??"page"} / ${e.slot??"main"}`},`${e.id}:${e.themeId}:${e.slot??"main"}`)}function hw(e){return{version:Number(e.layoutVersion??1),id:String(e.id),siteId:"string"==typeof e.site?e.site:String(e.site?.id??""),spaceId:"string"==typeof e.space?e.space:void 0,name:"string"==typeof e.name?e.name:void 0,path:String(e.path),status:"published"===e.status?"published":"draft",themeId:(0,rm.resolveTheme)(String(e.themeId??"")).id,surface:e.surface??"page",slot:"header"===e.slot||"footer"===e.slot||"announcement"===e.slot||"cta"===e.slot?e.slot:"main",templateId:"string"==typeof e.templateId?e.templateId:void 0,templateVersion:"number"==typeof e.templateVersion?e.templateVersion:void 0,templateMode:e.templateMode,isRetired:!0===e.isRetired,category:"string"==typeof e.category?e.category:void 0,blocks:Array.isArray(e.blocks)?e.blocks:[],unknownBlocks:Array.isArray(e.unknownBlocks)?e.unknownBlocks:[],revision:Number(e.revision??1),publishedRevision:"number"==typeof e.publishedRevision?e.publishedRevision:void 0}}e.s(["BuilderShell",0,function({layoutId:e}){let[t,r]=(0,r_.useState)(null),[n,o]=(0,r_.useState)("Loading draft canvas…"),[i,a]=(0,r_.useState)(!1),[l,s]=(0,r_.useState)(!1),[c,u]=(0,r_.useState)(null),[d,p]=(0,r_.useState)(0),[h,f]=(0,r_.useState)("canvas"),[v,g]=(0,r_.useState)(null),[m,_]=(0,r_.useState)("desktop"),[b,y]=(0,r_.useState)(""),[k,w]=(0,r_.useState)(""),[S,I]=(0,r_.useState)(""),[j,z]=(0,r_.useState)(""),[E,C]=(0,r_.useState)(""),[A,P]=(0,r_.useState)("inherited"),M=(0,r_.useCallback)(e=>{fetch(`/api/layouts/overview?siteId=${encodeURIComponent(e)}`).then(e=>e.ok?e.json():null).then(e=>{e&&g(e)}).catch(()=>{})},[]);(0,r_.useEffect)(()=>{fetch(`/api/page-layouts/${e}`).then(e=>e.ok?e.json():Promise.reject()).then(hw).then(e=>{r(e),p(e.revision),s(!1),o("Draft changes stay private until explicitly published."),e.siteId&&M(e.siteId)}).catch(()=>o("You do not have access to this layout or it is unavailable."))},[e,M]);let O=(0,r_.useCallback)(async(e,t=!1)=>{a(!0),r(e);try{let n=await fetch(`/api/layouts/${e.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({layout:e,publish:t,expectedRevision:d})}),i=await n.json();if(409===n.status&&i.current){window.sessionStorage.setItem(`renegade-layout-recovery:${e.id}`,JSON.stringify(e)),u(hw(i.current)),o("A newer server draft exists. Your local work is preserved for recovery.");return}if(n.ok&&i.layout){let e=hw(i.layout);r(e),p(e.revision),s(!1),e.siteId&&M(e.siteId)}o(n.ok?t?"🎉 Published successfully! Live for all visitors.":"💾 Draft saved locally to database.":"Could not save this layout. Verify permissions.")}catch{o("Network error while saving layout.")}finally{a(!1)}},[d,M]);(0,r_.useEffect)(()=>{if(!t||!l||i||c)return;let e=window.setTimeout(()=>void O(t,!1),1200);return()=>window.clearTimeout(e)},[t,l,i,c,O]);let D=async()=>{if(t&&b.trim()){a(!0);try{(await fetch("/api/layouts/patterns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"save",siteId:t.siteId,name:b.trim(),themeId:t.themeId,blocks:t.blocks})})).ok?(o(`Pattern "${b}" saved!`),y(""),M(t.siteId),f("patterns")):o("Failed to save pattern.")}catch{o("Error saving pattern.")}finally{a(!1)}}},T=async(e,n)=>{if(t){a(!0);try{let i=await fetch("/api/layouts/patterns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"instantiate",siteId:t.siteId,patternId:e,mode:n})}),a=await i.json();if(i.ok&&Array.isArray(a.blocks)){let e=[...t.blocks,...a.blocks],i={...t,blocks:e,revision:t.revision+1};r(i),s(!0),f("canvas"),o(`Pattern inserted as ${n}.`)}}catch{o("Error inserting pattern.")}finally{a(!1)}}},N=async()=>{if(t&&"number"==typeof k){a(!0);try{let e=await fetch(`/api/layouts/${t.id}/rollback`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetRevision:k})}),n=await e.json();if(e.ok&&n.layout){let e=hw(n.layout);r(e),p(e.revision),s(!1),o(`Rolled back to revision ${k}.`),w(""),f("canvas")}else o(n.error??"Rollback failed.")}catch{o("Error during rollback.")}finally{a(!1)}}},L=async()=>{if(t&&S&&j&&E){a(!0);try{let e=await fetch("/api/layouts/templates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create-page",siteId:t.siteId,path:S.startsWith("/")?S:`/${S}`,name:j,templateId:E,templateMode:A})}),r=await e.json();e.ok&&r.page?(o(`Page "${j}" created from template!`),I(""),z(""),M(t.siteId),f("pages")):o(r.error??"Failed to create page.")}catch{o("Error creating page from template.")}finally{a(!1)}}},B=async e=>{if(t){a(!0);try{(await fetch("/api/layouts/templates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"retire",siteId:t.siteId,templateId:e})})).ok&&(o("Template retired."),M(t.siteId))}finally{a(!1)}}};return t?(0,rg.jsxs)("main",{className:"min-h-screen flex flex-col bg-stone-100 dark:bg-stone-950",children:[(0,rg.jsxs)("div",{className:"glass-panel border-b border-stone-200 dark:border-stone-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-16 z-40",children:[(0,rg.jsxs)("div",{className:"flex items-center gap-4",children:[(0,rg.jsx)(rb.default,{href:"/",className:"text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100",children:"← Back"}),(0,rg.jsxs)("div",{className:"flex items-center gap-2",children:[(0,rg.jsx)("span",{className:"font-bold text-sm text-stone-900 dark:text-stone-100",children:t.name||t.path}),(0,rg.jsx)("span",{className:`badge text-[10px] ${"published"===t.status?"badge-brand":"badge-neutral"}`,children:t.status}),(0,rg.jsxs)("span",{className:"badge badge-neutral text-[10px] capitalize",children:[t.surface??"page"," : ",t.slot??"main"]}),(0,rg.jsxs)("span",{className:"font-mono text-xs text-stone-500",children:["Rev #",t.revision]})]})]}),(0,rg.jsxs)("div",{"data-testid":"studio-navigator",className:"flex items-center gap-1 bg-stone-200 dark:bg-stone-800 p-1 rounded-xl text-xs",children:[(0,rg.jsx)("button",{type:"button",onClick:()=>f("canvas"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"canvas"===h?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:"Canvas"}),(0,rg.jsxs)("button",{type:"button",onClick:()=>f("pages"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"pages"===h?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:["Pages ",v?.pages?`(${v.pages.length})`:""]}),(0,rg.jsxs)("button",{type:"button",onClick:()=>f("templates"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"templates"===h?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:["Templates ",v?.templates?`(${v.templates.length})`:""]}),(0,rg.jsxs)("button",{type:"button",onClick:()=>f("globals"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"globals"===h?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:["Globals ",v?.globals?`(${v.globals.length})`:""]}),(0,rg.jsxs)("button",{type:"button",onClick:()=>f("patterns"),className:`px-3 py-1 rounded-lg font-medium transition-all ${"patterns"===h?"bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100":"text-stone-600 dark:text-stone-400 hover:text-stone-900"}`,children:["Patterns ",v?.patterns?`(${v.patterns.length})`:""]})]}),(0,rg.jsxs)("div",{className:"flex items-center gap-3",children:[(0,rg.jsxs)("label",{className:"text-xs flex items-center gap-1",children:[(0,rg.jsx)("span",{className:"text-stone-500",children:"Theme:"}),(0,rg.jsxs)("select",{"aria-label":"Compatible theme",value:t.themeId,onChange:e=>{r({...t,themeId:(0,rm.resolveTheme)(e.target.value).id,revision:t.revision+1}),s(!0)},className:"text-xs bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded px-2 py-1",children:[(0,rg.jsx)("option",{value:"neutral-starter",children:"Neutral Starter"}),(0,rg.jsx)("option",{value:"renegade-party",children:"Renegade Party"})]})]}),(0,rg.jsxs)("div",{className:"flex items-center gap-1 border border-stone-300 dark:border-stone-700 rounded-lg p-0.5 bg-white dark:bg-stone-900",children:[(0,rg.jsx)("button",{type:"button","aria-label":"Desktop preview",onClick:()=>_("desktop"),className:`px-2 py-0.5 text-[10px] rounded ${"desktop"===m?"bg-stone-200 dark:bg-stone-800 font-bold":""}`,children:"Desktop"}),(0,rg.jsx)("button",{type:"button","aria-label":"Tablet preview",onClick:()=>_("tablet"),className:`px-2 py-0.5 text-[10px] rounded ${"tablet"===m?"bg-stone-200 dark:bg-stone-800 font-bold":""}`,children:"Tablet"}),(0,rg.jsx)("button",{type:"button","aria-label":"Mobile preview",onClick:()=>_("mobile"),className:`px-2 py-0.5 text-[10px] rounded ${"mobile"===m?"bg-stone-200 dark:bg-stone-800 font-bold":""}`,children:"Mobile"})]}),(0,rg.jsxs)(rb.default,{href:`/builder/${t.id}/preview?viewport=${m}`,target:"_blank",className:"btn btn-secondary text-xs px-3 py-1.5",children:["Exact Preview (",m,")"]}),(0,rg.jsx)("span",{className:"text-xs text-stone-600 dark:text-stone-400 hidden sm:inline-block font-mono",children:n}),(0,rg.jsx)("button",{type:"button",disabled:i,onClick:()=>void O(t,!1),className:"btn btn-secondary text-xs px-3.5 py-1.5",children:i?"Saving...":"Save Draft"}),(0,rg.jsx)("button",{type:"button",disabled:i,onClick:()=>void O(t,!0),className:"btn btn-primary text-xs px-4 py-1.5",children:i?"Publishing...":"Publish Live"})]})]}),c?(0,rg.jsxs)("div",{role:"alert",className:"border-b border-amber-300 bg-amber-50 px-6 py-3 text-sm text-amber-950 flex items-center justify-between",children:[(0,rg.jsxs)("span",{children:["Save conflict: server revision ",c.revision," is newer. Your draft is stored in this browser session."]}),(0,rg.jsx)("button",{type:"button",className:"underline font-medium",onClick:()=>{r(c),p(c.revision),u(null),s(!1)},children:"Reload server version"})]}):null,(t.unknownBlocks?.length??0)>0?(0,rg.jsxs)("div",{role:"status",className:"border-b border-rose-300 bg-rose-50 px-6 py-3 text-sm text-rose-950",children:["Repair required: ",t.unknownBlocks?.length," section(s) use removed or incompatible components. Their data is preserved and public rendering uses a safe unavailable-section fallback."]}):null,"pages"===h?(0,rg.jsxs)("div",{className:"max-w-5xl mx-auto w-full p-8 space-y-6",children:[(0,rg.jsxs)("div",{className:"flex items-center justify-between",children:[(0,rg.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:"Site Pages"}),(0,rg.jsx)("button",{type:"button",onClick:()=>f("canvas"),className:"btn btn-secondary text-xs",children:"Back to Canvas"})]}),(0,rg.jsx)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm",children:(0,rg.jsxs)("table",{className:"w-full text-left text-xs",children:[(0,rg.jsx)("thead",{className:"bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700",children:(0,rg.jsxs)("tr",{children:[(0,rg.jsx)("th",{className:"p-4",children:"Path"}),(0,rg.jsx)("th",{className:"p-4",children:"Title / Name"}),(0,rg.jsx)("th",{className:"p-4",children:"Status"}),(0,rg.jsx)("th",{className:"p-4",children:"Template Mode"}),(0,rg.jsx)("th",{className:"p-4",children:"Revision"}),(0,rg.jsx)("th",{className:"p-4 text-right",children:"Actions"})]})}),(0,rg.jsx)("tbody",{className:"divide-y divide-stone-100 dark:divide-stone-800",children:v?.pages.map(e=>(0,rg.jsxs)("tr",{className:"hover:bg-stone-50/50 dark:hover:bg-stone-800/50",children:[(0,rg.jsx)("td",{className:"p-4 font-mono font-medium",children:e.path}),(0,rg.jsx)("td",{className:"p-4",children:e.name||"—"}),(0,rg.jsx)("td",{className:"p-4",children:(0,rg.jsx)("span",{className:`badge text-[10px] ${"published"===e.status?"badge-brand":"badge-neutral"}`,children:e.status})}),(0,rg.jsx)("td",{className:"p-4",children:e.templateId?(0,rg.jsxs)("span",{className:"badge badge-neutral text-[10px] capitalize",children:[e.templateMode||"inherited"," (v",e.templateVersion??1,")"]}):(0,rg.jsx)("span",{className:"text-stone-400",children:"—"})}),(0,rg.jsxs)("td",{className:"p-4 font-mono",children:["#",e.revision]}),(0,rg.jsxs)("td",{className:"p-4 text-right space-x-2",children:[(0,rg.jsx)("a",{href:`/builder/${e.id}`,className:"btn btn-secondary btn-xs",children:"Open"}),(0,rg.jsx)("a",{href:`/builder/${e.id}/preview`,target:"_blank",className:"btn btn-secondary btn-xs",children:"Preview"})]})]},e.id))})]})})]}):null,"templates"===h?(0,rg.jsxs)("div",{className:"max-w-5xl mx-auto w-full p-8 space-y-6",children:[(0,rg.jsxs)("div",{className:"flex items-center justify-between",children:[(0,rg.jsxs)("div",{children:[(0,rg.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:"Reusable Page Templates"}),(0,rg.jsx)("p",{className:"text-xs text-stone-500",children:"Create new pages from templates with inherited, explicit, or detached composition."})]}),(0,rg.jsx)("button",{type:"button",onClick:()=>f("canvas"),className:"btn btn-secondary text-xs",children:"Back to Canvas"})]}),(0,rg.jsxs)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4",children:[(0,rg.jsx)("h3",{className:"text-sm font-bold text-stone-900 dark:text-stone-100",children:"Create New Page From Template"}),(0,rg.jsxs)("div",{className:"grid grid-cols-1 sm:grid-cols-4 gap-4",children:[(0,rg.jsx)("input",{type:"text",placeholder:"Page Title (e.g. Schedule)",value:j,onChange:e=>z(e.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent"}),(0,rg.jsx)("input",{type:"text",placeholder:"Path (e.g. /schedule)",value:S,onChange:e=>I(e.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent"}),(0,rg.jsxs)("select",{value:E,onChange:e=>C(e.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent",children:[(0,rg.jsx)("option",{value:"",children:"Select Template…"}),v?.templates.filter(e=>!e.isRetired).map(e=>(0,rg.jsxs)("option",{value:e.id,children:[e.name," (v",e.revision,")"]},e.id))]}),(0,rg.jsxs)("select",{value:A,onChange:e=>P(e.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent",children:[(0,rg.jsx)("option",{value:"inherited",children:"Inherited (Draft syncs)"}),(0,rg.jsx)("option",{value:"explicit",children:"Explicitly applied"}),(0,rg.jsx)("option",{value:"detached",children:"Detached (One-time clone)"})]})]}),(0,rg.jsx)("button",{type:"button",disabled:i||!j||!S||!E,onClick:()=>void L(),className:"btn btn-primary text-xs",children:"Create Page"})]}),(0,rg.jsx)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm",children:(0,rg.jsxs)("table",{className:"w-full text-left text-xs",children:[(0,rg.jsx)("thead",{className:"bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700",children:(0,rg.jsxs)("tr",{children:[(0,rg.jsx)("th",{className:"p-4",children:"Name"}),(0,rg.jsx)("th",{className:"p-4",children:"Category"}),(0,rg.jsx)("th",{className:"p-4",children:"Status"}),(0,rg.jsx)("th",{className:"p-4",children:"Version"}),(0,rg.jsx)("th",{className:"p-4",children:"Used By"}),(0,rg.jsx)("th",{className:"p-4 text-right",children:"Actions"})]})}),(0,rg.jsx)("tbody",{className:"divide-y divide-stone-100 dark:divide-stone-800",children:v?.templates.map(e=>(0,rg.jsxs)("tr",{className:"hover:bg-stone-50/50 dark:hover:bg-stone-800/50",children:[(0,rg.jsx)("td",{className:"p-4 font-medium",children:e.name}),(0,rg.jsx)("td",{className:"p-4",children:e.category}),(0,rg.jsx)("td",{className:"p-4",children:e.isRetired?(0,rg.jsx)("span",{className:"badge badge-error text-[10px]",children:"Retired"}):(0,rg.jsx)("span",{className:"badge badge-brand text-[10px]",children:"Active"})}),(0,rg.jsxs)("td",{className:"p-4 font-mono",children:["v",e.revision]}),(0,rg.jsxs)("td",{className:"p-4 font-mono",children:[e.usageCount," page(s)"]}),(0,rg.jsxs)("td",{className:"p-4 text-right space-x-2",children:[(0,rg.jsx)("a",{href:`/builder/${e.id}`,className:"btn btn-secondary btn-xs",children:"Edit"}),e.isRetired?null:(0,rg.jsx)("button",{type:"button",onClick:()=>void B(e.id),className:"btn btn-secondary btn-xs",children:"Retire"})]})]},e.id))})]})})]}):null,"globals"===h?(0,rg.jsxs)("div",{className:"max-w-5xl mx-auto w-full p-8 space-y-6",children:[(0,rg.jsxs)("div",{className:"flex items-center justify-between",children:[(0,rg.jsxs)("div",{children:[(0,rg.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:"Global Regions"}),(0,rg.jsx)("p",{className:"text-xs text-stone-500",children:"Manage site-wide headers, footers, announcements, and call-to-actions with rollback."})]}),(0,rg.jsx)("button",{type:"button",onClick:()=>f("canvas"),className:"btn btn-secondary text-xs",children:"Back to Canvas"})]}),(0,rg.jsx)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm",children:(0,rg.jsxs)("table",{className:"w-full text-left text-xs",children:[(0,rg.jsx)("thead",{className:"bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700",children:(0,rg.jsxs)("tr",{children:[(0,rg.jsx)("th",{className:"p-4",children:"Region"}),(0,rg.jsx)("th",{className:"p-4",children:"Slot"}),(0,rg.jsx)("th",{className:"p-4",children:"Status"}),(0,rg.jsx)("th",{className:"p-4",children:"Revision"}),(0,rg.jsx)("th",{className:"p-4 text-right",children:"Actions"})]})}),(0,rg.jsx)("tbody",{className:"divide-y divide-stone-100 dark:divide-stone-800",children:v?.globals.map(e=>(0,rg.jsxs)("tr",{className:"hover:bg-stone-50/50 dark:hover:bg-stone-800/50",children:[(0,rg.jsx)("td",{className:"p-4 font-medium",children:e.name}),(0,rg.jsx)("td",{className:"p-4 font-mono uppercase",children:e.slot}),(0,rg.jsx)("td",{className:"p-4",children:(0,rg.jsx)("span",{className:`badge text-[10px] ${"published"===e.status?"badge-brand":"badge-neutral"}`,children:e.status})}),(0,rg.jsxs)("td",{className:"p-4 font-mono",children:["#",e.revision]}),(0,rg.jsxs)("td",{className:"p-4 text-right space-x-2",children:[(0,rg.jsx)("a",{href:`/builder/${e.id}`,className:"btn btn-secondary btn-xs",children:"Edit"}),(0,rg.jsx)("a",{href:`/builder/${e.id}/preview`,target:"_blank",className:"btn btn-secondary btn-xs",children:"Preview"})]})]},e.id))})]})}),(0,rg.jsxs)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4",children:[(0,rg.jsx)("h3",{className:"text-sm font-bold text-stone-900 dark:text-stone-100",children:"Rollback Current Document"}),(0,rg.jsx)("p",{className:"text-xs text-stone-500",children:"Restore this layout to a previous revision number from its audit trail."}),(0,rg.jsxs)("div",{className:"flex items-center gap-3",children:[(0,rg.jsx)("input",{type:"number",min:1,max:t.revision-1,placeholder:"Target Revision Number",value:k,onChange:e=>w(e.target.value?Number(e.target.value):""),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent w-48"}),(0,rg.jsx)("button",{type:"button",disabled:i||"number"!=typeof k,onClick:()=>void N(),className:"btn btn-secondary text-xs",children:"Rollback Revision"})]})]})]}):null,"patterns"===h?(0,rg.jsxs)("div",{className:"max-w-5xl mx-auto w-full p-8 space-y-6",children:[(0,rg.jsxs)("div",{className:"flex items-center justify-between",children:[(0,rg.jsxs)("div",{children:[(0,rg.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:"Reusable Patterns"}),(0,rg.jsx)("p",{className:"text-xs text-stone-500",children:"Insert saved component trees into your layout as independent snapshots or linked instances."})]}),(0,rg.jsx)("button",{type:"button",onClick:()=>f("canvas"),className:"btn btn-secondary text-xs",children:"Back to Canvas"})]}),(0,rg.jsxs)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4",children:[(0,rg.jsx)("h3",{className:"text-sm font-bold text-stone-900 dark:text-stone-100",children:"Save Current Canvas as Reusable Pattern"}),(0,rg.jsxs)("div",{className:"flex items-center gap-3",children:[(0,rg.jsx)("input",{type:"text",placeholder:"Pattern Name (e.g. Callout + Features)",value:b,onChange:e=>y(e.target.value),className:"text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent flex-1 max-w-sm"}),(0,rg.jsx)("button",{type:"button",disabled:i||!b.trim(),onClick:()=>void D(),className:"btn btn-primary text-xs",children:"Save as Pattern"})]})]}),(0,rg.jsxs)("div",{className:"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",children:[v?.patterns.map(e=>(0,rg.jsxs)("div",{className:"bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 space-y-3 shadow-sm",children:[(0,rg.jsxs)("div",{className:"flex items-center justify-between",children:[(0,rg.jsx)("span",{className:"font-bold text-sm text-stone-900 dark:text-stone-100",children:e.name}),(0,rg.jsxs)("span",{className:"badge badge-neutral text-[10px]",children:["v",e.revision]})]}),(0,rg.jsxs)("p",{className:"text-xs text-stone-500",children:["Category: ",e.category]}),(0,rg.jsxs)("div",{className:"pt-2 flex items-center gap-2",children:[(0,rg.jsx)("button",{type:"button",onClick:()=>void T(e.id,"snapshot"),className:"btn btn-secondary text-xs flex-1",children:"Insert Snapshot"}),(0,rg.jsx)("button",{type:"button",onClick:()=>void T(e.id,"linked"),className:"btn btn-primary text-xs flex-1",children:"Insert Linked"})]})]},e.id)),(v?.patterns.length??0)===0?(0,rg.jsx)("p",{className:"text-xs text-stone-500 col-span-3",children:"No saved patterns yet. Save one above!"}):null]})]}):null,"canvas"===h?(0,rg.jsx)("div",{className:"flex-1",children:(0,rg.jsx)(hk,{layout:t,onChange:e=>{r(e),s(!0),o("Unsaved changes — autosaving…")},onPublish:e=>void O(e,!0)})}):null]}):(0,rg.jsxs)("main",{className:"max-w-4xl mx-auto px-6 py-24 text-center space-y-4",children:[(0,rg.jsx)("div",{className:"w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto text-xl",children:"🎨"}),(0,rg.jsx)("h2",{className:"text-xl font-bold text-stone-900 dark:text-stone-100",children:n}),(0,rg.jsxs)("p",{className:"text-xs text-stone-500 font-mono",children:["Layout ID: ",e]}),(0,rg.jsx)("div",{className:"pt-4",children:(0,rg.jsx)(rb.default,{href:"/",className:"btn btn-secondary text-xs",children:"← Return to Home"})})]})}],343007)}]);