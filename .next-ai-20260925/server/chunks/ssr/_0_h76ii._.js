module.exports=[424792,a=>{"use strict";a.s(["NavHamburger",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call NavHamburger() from the server but NavHamburger is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/elements/Nav/NavHamburger/index.js","NavHamburger")},840940,a=>{"use strict";var b=a.i(424792);a.n(b)},402765,a=>{"use strict";a.s(["NavWrapper",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call NavWrapper() from the server but NavWrapper is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/elements/Nav/NavWrapper/index.js","NavWrapper")},220185,a=>{"use strict";var b=a.i(402765);a.n(b)},237773,a=>{"use strict";a.s(["SettingsMenuButton",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call SettingsMenuButton() from the server but SettingsMenuButton is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/elements/Nav/SettingsMenuButton/index.js","SettingsMenuButton")},592825,a=>{"use strict";var b=a.i(237773);a.n(b)},586339,a=>{"use strict";a.s(["DefaultNavClient",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call DefaultNavClient() from the server but DefaultNavClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/elements/Nav/index.client.js","DefaultNavClient")},375976,a=>{"use strict";var b=a.i(586339);a.n(b)},902082,a=>{"use strict";a.s(["NavHamburger",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call NavHamburger() from the server but NavHamburger is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/templates/Default/NavHamburger/index.js","NavHamburger")},50158,a=>{"use strict";var b=a.i(902082);a.n(b)},986205,a=>{"use strict";a.s(["Wrapper",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Wrapper() from the server but Wrapper is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/templates/Default/Wrapper/index.js","Wrapper")},56486,a=>{"use strict";var b=a.i(986205);a.n(b)},977523,a=>{"use strict";var b=a.i(695907),c=a.i(905246),d=a.i(280367);let e=async({config:a})=>await (0,b.initI18n)({config:a.i18n,context:"client",language:(0,d.getRequestLanguage)({config:a,cookies:await (0,c.cookies)(),headers:await (0,c.headers)()})});a.s(["getNextRequestI18n",0,e])},603570,a=>{"use strict";a.s(["APIViewClient",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call APIViewClient() from the server but APIViewClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/API/index.client.js","APIViewClient")},688089,a=>{"use strict";var b=a.i(603570);a.n(b)},768768,362077,378736,a=>{"use strict";var b=a.i(907997);a.i(800717);var c=a.i(688089);a.s(["APIView",0,function(a){return(0,b.jsx)(c.APIViewClient,{})}],768768);var d=a.i(728309),e=a.i(911082);function f({description:a,heading:c}){return c?(0,b.jsxs)("div",{className:"form-header",children:[(0,b.jsx)("h1",{children:c}),!!a&&(0,b.jsx)("p",{children:a})]}):null}a.s(["FormHeader",0,f],362077);let g="unauthorized";function h({initPageResult:a}){let{permissions:c,req:{i18n:i,payload:{config:{admin:{routes:{logout:j}},routes:{admin:k}}},user:l}}=a;return(0,b.jsxs)("div",{className:g,children:[(0,b.jsx)(f,{description:i.t("error:notAllowedToAccessPage"),heading:i.t(l&&!c.canAccessAdmin?"error:unauthorizedAdmin":"error:unauthorized")}),(0,b.jsx)(d.Button,{className:`${g}__button`,el:"link",size:"large",to:(0,e.formatAdminURL)({adminRoute:k,path:j}),children:i.t("authentication:logOut")})]})}a.s(["UnauthorizedView",0,h,"UnauthorizedViewWithGutter",0,a=>(0,b.jsx)(d.Gutter,{className:[g,`${g}--with-gutter`].join(" "),children:(0,b.jsx)(h,{...a})})],378736)},3455,400192,277085,680130,92945,180805,a=>{"use strict";var b=a.i(851177),c=a.i(56507),c=c,d=a.i(326351),d=d,e=a.i(216235),e=e,f=a.i(502764);let g={description:"Payload is a headless CMS and application framework built with TypeScript, Node.js, and React.",siteName:"Payload App",title:"Payload App"},h=async a=>{var b;let{defaultOGImageType:h,serverURL:i,titleSuffix:j,...k}=a,l=k.icons||[{type:"image/png",rel:"icon",sizes:"32x32",url:"object"==typeof c.default?c.default?.src:c.default},{type:"image/png",media:"(prefers-color-scheme: dark)",rel:"icon",sizes:"32x32",url:"object"==typeof d.default?d.default?.src:d.default}],m=(b=k.title,j&&b?"string"==typeof b?`${b} ${j}`:"default"in b?{default:`${b.default} ${j}`,template:`${b.template} ${j}`}:"template"in b?{absolute:`${b.absolute} ${j}`,template:null!==b.template?`${b.template} ${j}`:null}:{absolute:`${b.absolute} ${j}`}:b??void 0),n=["string"==typeof k.openGraph?.title?k.openGraph.title:(a=>{if(a)return"string"==typeof a?a:"absolute"in a?a.absolute:a.default})(k.title),j].filter(Boolean).join(" "),o={...g||{},..."dynamic"===h?{images:[{alt:n,height:630,url:`/api/og${f.stringify({description:k.openGraph?.description||g.description,title:n},{addQueryPrefix:!0})}`,width:1200}]}:{},..."static"===h?{images:[{alt:n,height:480,url:"object"==typeof e.default?e.default?.src:e.default,width:640}]}:{},title:n,...k.openGraph||{}};return Promise.resolve({...k,icons:l,metadataBase:new URL(i||process.env.PAYLOAD_PUBLIC_SERVER_URL||`http://localhost:${process.env.PORT||3e3}`),openGraph:o,title:m})};a.s(["generateMetadata",0,h],400192);let i=async({collectionConfig:a,config:c,globalConfig:d,i18n:e})=>{let f=a?(0,b.getTranslation)(a.labels.singular,e):d?(0,b.getTranslation)(d.label,e):"";return Promise.resolve(h({...c.admin.meta||{},description:`API - ${f}`,keywords:"API",serverURL:c.serverURL,title:`API - ${f}`,...a?{...a?.admin.meta||{},...a?.admin?.components?.views?.edit?.api?.meta||{}}:{},...d?{...d?.admin.meta||{},...d?.admin?.components?.views?.edit?.api?.meta||{}}:{}}))};a.s(["generateAPIViewMetadata",0,i],3455);let j=async({collectionConfig:a,config:c,globalConfig:d,i18n:e,isEditing:f,isReadOnly:g=!1,view:i="default"})=>{let{t:j}=e,k=a?(0,b.getTranslation)(a.labels.singular,e):d?(0,b.getTranslation)(d.label,e):"",l=j(g?"general:viewing":f?"general:editing":"general:creating"),m={...c.admin.meta||{},description:`${l} - ${k}`,keywords:`${k}, Payload, CMS`,title:`${l} - ${k}`},n={title:`${j("general:edit")} - ${k}`,...c.admin.meta.openGraph||{},...a?{...a?.admin.meta?.openGraph||{},...a?.admin?.components?.views?.edit?.[i]?.meta?.openGraph||{}}:{},...d?{...d?.admin.meta?.openGraph||{},...d?.admin?.components?.views?.edit?.[i]?.meta?.openGraph||{}}:{}};return h({...m,openGraph:n,...a?{...a?.admin.meta||{},...a?.admin?.components?.views?.edit?.[i]?.meta||{}}:{},...d?{...d?.admin.meta||{},...d?.admin?.components?.views?.edit?.[i]?.meta||{}}:{},serverURL:c.serverURL})};a.s(["generateEditViewMetadata",0,j],277085);let k=async({config:a,i18n:b})=>h({description:b.t("general:pageNotFound"),keywords:`404 ${b.t("general:notFound")}`,serverURL:a.serverURL,title:b.t("general:notFound")});a.s(["generateNotFoundViewMetadata",0,k],680130);var l=a.i(473060);let m=async({collectionConfig:a,config:c,globalConfig:d,i18n:e})=>{let{t:f}=e,g={...c.admin.meta||{}},i={},j=i?.createdAt?(0,l.formatDate)({date:i.createdAt,i18n:e,pattern:c?.admin?.dateFormat}):"";if(a){let d=a?.admin?.useAsTitle||"id",h=(0,b.getTranslation)(a.labels.singular,e),k=i?.[d];g={...c.admin.meta||{},description:f("version:viewingVersion",{documentTitle:k,entityLabel:h}),title:`${f("version:version")}${j?` - ${j}`:""}${k?` - ${k}`:""} - ${h}`,...a?.admin?.meta||{},...a?.admin?.components?.views?.edit?.version?.meta||{}}}if(d){let a=(0,b.getTranslation)(d.label,e);g={...c.admin.meta||{},description:f("version:viewingVersionGlobal",{entityLabel:a}),title:`${f("version:version")}${j?` - ${j}`:""}${a}`,...d?.admin?.meta||{},...d?.admin?.components?.views?.edit?.version?.meta||{}}}return h({...g,serverURL:c.serverURL})};a.s(["generateVersionViewMetadata",0,m],92945);let n=async({collectionConfig:a,config:c,globalConfig:d,i18n:e})=>{let{t:f}=e,g=a?(0,b.getTranslation)(a.labels.singular,e):d?(0,b.getTranslation)(d.label,e):"",i={...c.admin.meta||{}},j={};if(a){let b=a?.admin?.useAsTitle||"id",d=j?.[b];i={...c.admin.meta||{},description:f("version:viewingVersions",{documentTitle:j?.[b],entitySlug:a.slug}),title:`${f("version:versions")}${d?` - ${d}`:""} - ${g}`,...a?.admin.meta||{},...a?.admin?.components?.views?.edit?.versions?.meta||{}}}return d&&(i={...c.admin.meta||{},description:f("version:viewingVersionsGlobal",{entitySlug:d.slug}),title:`${f("version:versions")} - ${g}`,...d?.admin.meta||{},...d?.admin?.components?.views?.edit?.versions?.meta||{}}),h({...i,serverURL:c.serverURL})};a.s(["generateVersionsViewMetadata",0,n],180805)},559652,390529,a=>{"use strict";var b=a.i(768768),c=a.i(520922),d=a.i(378736),e=a.i(907997),f=a.i(473060),g=a.i(953867),h=a.i(877113),i=a.i(661861),j=a.i(232550),k=a.i(510677),l=a.i(800717),m=a.i(528613),n=a.i(368905);let o=async({id:a,collectionSlug:b,depth:c,globalSlug:d,locale:e,overrideAccess:f,req:g,select:h,user:i})=>{try{if(b)return await g.payload.findVersionByID({id:String(a),collection:b,depth:c,locale:e,overrideAccess:f,req:g,select:h,user:i});if(d)return await g.payload.findGlobalVersionByID({id:String(a),slug:d,depth:c,locale:e,overrideAccess:f,req:g,select:h,user:i})}catch(a){return(0,n.logError)({err:a,payload:g.payload}),null}},p=async({collectionSlug:a,depth:b,draft:c,globalSlug:d,limit:e,locale:f,overrideAccess:g,page:h,parentID:i,req:j,select:k,sort:l,user:m,where:o})=>{let p={and:[...o?[o]:[]]};try{if(a)return i&&p.and.push({parent:{equals:i}}),await j.payload.findVersions({collection:a,depth:b,draft:c,limit:e,locale:f,overrideAccess:g,page:h,req:j,select:k,sort:l,user:m,where:p});if(d)return await j.payload.findGlobalVersions({slug:d,depth:b,limit:e,locale:f,overrideAccess:g,page:h,req:j,select:k,sort:l,user:m,where:p})}catch(a){return(0,n.logError)({err:a,payload:j.payload}),null}},q=async({collectionSlug:a,depth:b,globalSlug:c,locale:d,overrideAccess:e,parentID:f,req:g,select:h,status:i,user:j,where:k})=>{let l=a?g.payload.collections[a]?.config:c?g.payload.globals[c]?.config:void 0,m=[...l?.versions?.drafts?[{"version._status":{equals:i}}]:[],...k?[k]:[]],n=await p({collectionSlug:a,depth:b,draft:!0,globalSlug:c,limit:1,locale:d,overrideAccess:e,parentID:f,req:g,select:h,sort:"-updatedAt",user:j,where:{and:m}});return n?.docs?.length?n.docs[0]:null};var r=a.i(646096),s=a.i(954177),t=a.i(166274),u=a.i(299463),v=a.i(118726),w=a.i(544330),x=a.i(766721),y=a.i(616078),z=a.i(808253),A=a.i(851177),B=a.i(609188),C=a.i(228100),D=a.i(207414);let E=async({field:a,locale:b,parentIsLocalized:c,req:d,value:e})=>{let f,g=a.relationTo,h="";"object"==typeof e&&"relationTo"in e?(f=e.value,g=e.relationTo):f=e;let i=d.payload.collections[g].config,j=i?.admin?.useAsTitle,k=(0,D.flattenTopLevelFields)(i.fields,{moveSubFieldsToTop:!0}).find(a=>(0,u.fieldAffectsData)(a)&&!(0,u.fieldIsPresentationalOnly)(a)&&a.name===j),l=!1;if(k&&(0,u.fieldAffectsData)(k)&&(l=(0,u.fieldShouldBeLocalized)({field:k,parentIsLocalized:c})),void 0!==f?.[j])h=f[j];else if("string"==typeof f||"number"==typeof f)try{let a=await d.payload.findByID({id:f,collection:g,depth:0,locale:l?b:void 0,req:d,select:{[j]:!0}});h=a?.[j]?a[j]:`${d.i18n.t("general:untitled")} - ID: ${f}`}catch(a){h=`${d.i18n.t("general:untitled")} - ID: ${f}`}else h=String("object"==typeof f?f.id:f);return"object"==typeof h&&h&&l&&h?.[b]&&(h=h[b]),(h&&"object"==typeof h&&null!==h||"string"!=typeof h)&&(h=JSON.stringify(h)),h},F="relationship-diff",G=async b=>{let{field:c,i18n:d,locale:f,nestingLevel:g,parentIsLocalized:h,polymorphic:i,req:j,valueFrom:k,valueTo:l}=b,m=(await a.A(994653)).default,n=f??(j.payload.config?.localization&&j.payload.config?.localization?.defaultLocale)??"en",[o,p]=await Promise.all([k?E({field:c,locale:n,parentIsLocalized:h,req:j,value:k}):Promise.resolve(null),l?E({field:c,locale:n,parentIsLocalized:h,req:j,value:l}):Promise.resolve(null)]),q=k?(0,e.jsx)(I,{field:c,i18n:d,locale:f,parentIsLocalized:h,polymorphic:i,relationTo:i?k.relationTo:c.relationTo,req:j,showPill:!0,title:o,value:k}):null,r=l?(0,e.jsx)(I,{field:c,i18n:d,locale:f,parentIsLocalized:h,polymorphic:i,relationTo:i?l.relationTo:c.relationTo,req:j,showPill:!0,title:p,value:l}):null,s=q?m.renderToStaticMarkup(q):"<p></p>",t=r?m.renderToStaticMarkup(r):"<p></p>",u=(0,C.getHTMLDiffComponents)({fromHTML:s,toHTML:t,tokenizeByCharacter:!1});return(0,e.jsx)(B.FieldDiffContainer,{className:`${F}-container ${F}-container--hasOne`,From:u.From,i18n:d,label:{label:c.label,locale:f},nestingLevel:g,To:u.To})},H=async({field:b,i18n:c,locale:d,nestingLevel:f,parentIsLocalized:g,polymorphic:h,req:i,valueFrom:j,valueTo:k})=>{let l=(await a.A(994653)).default,m=Array.isArray(j)?j:[],n=Array.isArray(k)?k:[],o=d??(i.payload.config?.localization&&i.payload.config?.localization?.defaultLocale)??"en",[p,q]=await Promise.all([Promise.all(m.map(a=>E({field:b,locale:o,parentIsLocalized:g,req:i,value:a}))),Promise.all(n.map(a=>E({field:b,locale:o,parentIsLocalized:g,req:i,value:a})))]),r=(a,f)=>a.map((a,j)=>(0,e.jsx)(I,{field:b,i18n:c,locale:d,parentIsLocalized:g,polymorphic:h,relationTo:h?a.relationTo:b.relationTo,req:i,showPill:h,title:f[j],value:a},j)),s=m.length>0?r(m,p):(0,e.jsx)("p",{className:`${F}__empty`}),t=n.length>0?r(n,q):(0,e.jsx)("p",{className:`${F}__empty`}),u=l.renderToStaticMarkup(s),v=l.renderToStaticMarkup(t),w=(0,C.getHTMLDiffComponents)({fromHTML:u,toHTML:v,tokenizeByCharacter:!1});return(0,e.jsx)(B.FieldDiffContainer,{className:`${F}-container ${F}-container--hasMany`,From:w.From,i18n:c,label:{label:b.label,locale:d},nestingLevel:f,To:w.To})},I=({field:a,i18n:b,locale:c,parentIsLocalized:d,polymorphic:f,relationTo:g,req:h,showPill:i=!1,title:j,value:k})=>{let l=null;if(i){let a=h.payload.collections[g].config;l=a.labels?.singular?(0,A.getTranslation)(a.labels.singular,b):a.slug}return(0,e.jsxs)("div",{className:`${F}`,"data-enable-match":"true","data-id":f?k.value.id:k.id,"data-relation-to":g,children:[l&&(0,e.jsx)("span",{className:`${F}__pill`,"data-enable-match":"false",children:l}),(0,e.jsx)("strong",{className:`${F}__info`,"data-enable-match":"false",children:j})]})};var J=a.i(420103),K=a.i(331327),L=a.i(3454),M=a.i(990820),N=a.i(266688);let O="upload-diff",P=async b=>{let{field:c,i18n:d,locale:f,nestingLevel:g,polymorphic:h,req:i,valueFrom:j,valueTo:k}=b,l=(await a.A(994653)).default,m="",n="",o=Array.isArray(c.relationTo),p=a=>{if("object"==typeof a&&"relationTo"in a){let b=a.value;return"object"==typeof b?b.id:b}return"object"==typeof a?a.id:a},q=j?j.map(a=>(0,e.jsx)(R,{i18n:d,polymorphic:h,relationTo:c.relationTo,req:i,showCollectionSlug:o,uploadDoc:a},p(a))):null,r=k?k.map(a=>(0,e.jsx)(R,{i18n:d,polymorphic:h,relationTo:c.relationTo,req:i,showCollectionSlug:o,uploadDoc:a},p(a))):null,s=(0,C.getHTMLDiffComponents)({fromHTML:`<div class="${O}-hasMany">`+(q?q.map(a=>`<div>${l.renderToStaticMarkup(a)}</div>`).join(""):"")+"</div>",toHTML:`<div class="${O}-hasMany">`+(r?r.map(a=>`<div>${l.renderToStaticMarkup(a)}</div>`).join(""):"")+"</div>",tokenizeByCharacter:!1});return m=s.From,n=s.To,(0,e.jsx)(B.FieldDiffContainer,{className:`${O}-container ${O}-container--hasMany`,From:m,i18n:d,label:{label:c.label,locale:f},nestingLevel:g,To:n})},Q=async b=>{let{field:c,i18n:d,locale:f,nestingLevel:g,polymorphic:h,req:i,valueFrom:j,valueTo:k}=b,l=(await a.A(994653)).default,m="",n="",o=Array.isArray(c.relationTo),p=j?(0,e.jsx)(R,{i18n:d,polymorphic:h,relationTo:c.relationTo,req:i,showCollectionSlug:o,uploadDoc:j}):null,q=k?(0,e.jsx)(R,{i18n:d,polymorphic:h,relationTo:c.relationTo,req:i,showCollectionSlug:o,uploadDoc:k}):null,r=p?l.renderToStaticMarkup(p):"<p></p>",s=q?l.renderToStaticMarkup(q):"<p></p>",t=(0,C.getHTMLDiffComponents)({fromHTML:r,toHTML:s,tokenizeByCharacter:!1});return m=t.From,n=t.To,(0,e.jsx)(B.FieldDiffContainer,{className:`${O}-container ${O}-container--hasOne`,From:m,i18n:d,label:{label:c.label,locale:f},nestingLevel:g,To:n})},R=a=>{let b,c,{i18n:d,polymorphic:f,relationTo:g,req:h,showCollectionSlug:i,uploadDoc:j}=a,k="",l=f?j.value:j;l&&"object"==typeof l&&"thumbnailURL"in l&&(k="string"==typeof l.thumbnailURL&&l.thumbnailURL||"string"==typeof l.url&&l.url||""),b=l&&"object"==typeof l?l.filename:`${d.t("general:untitled")} - ID: ${j}`;let m=null;if(i){let a;a=f&&"object"==typeof j&&"relationTo"in j?j.relationTo:"string"==typeof g?g:g[0];let b=h.payload.collections[a].config;m=b.labels?.singular?(0,A.getTranslation)(b.labels.singular,d):b.slug}if(f&&"object"==typeof j&&"relationTo"in j){let a=j.value;c="object"==typeof a?a.id:a}else"object"==typeof j&&"id"in j?c=j.id:("string"==typeof j||"number"==typeof j)&&(c=j);let n=l&&"object"==typeof l&&l.alt||b||"";return(0,e.jsx)("div",{className:`${O}`,"data-enable-match":"true","data-id":c,"data-relation-to":g,children:(0,e.jsxs)("div",{className:`${O}__card`,children:[(0,e.jsx)("div",{className:`${O}__thumbnail`,children:k?.length?(0,e.jsx)("img",{alt:n,src:k}):(0,e.jsx)(N.File,{})}),m&&(0,e.jsx)("div",{className:`${O}__pill`,"data-enable-match":"false",children:(0,e.jsx)("span",{children:m})}),(0,e.jsx)("div",{className:`${O}__info`,"data-enable-match":"false",children:(0,e.jsx)("strong",{children:b})})]})})},S={array:z.Iterable,blocks:z.Iterable,checkbox:M.Text,code:M.Text,collapsible:w.Collapsible,date:x.DateDiffComponent,email:M.Text,group:y.Group,join:null,json:M.Text,number:M.Text,point:M.Text,radio:K.Select,relationship:({comparisonValue:a,field:b,i18n:c,locale:d,nestingLevel:f,parentIsLocalized:g,req:h,versionValue:i})=>{let j="hasMany"in b&&b.hasMany||Array.isArray(a)||Array.isArray(i),k=Array.isArray(b.relationTo);return j?(0,e.jsx)(H,{field:b,i18n:c,locale:d,nestingLevel:f,parentIsLocalized:g,polymorphic:k,req:h,valueFrom:a,valueTo:i}):(0,e.jsx)(G,{field:b,i18n:c,locale:d,nestingLevel:f,parentIsLocalized:g,polymorphic:k,req:h,valueFrom:a,valueTo:i})},richText:M.Text,row:J.Row,select:K.Select,tabs:L.Tabs,text:M.Text,textarea:M.Text,ui:null,upload:a=>{let{comparisonValue:b,field:c,i18n:d,locale:f,nestingLevel:g,req:h,versionValue:i}=a,j="hasMany"in c&&c.hasMany&&Array.isArray(i),k=Array.isArray(c.relationTo);return j?(0,e.jsx)(P,{field:c,i18n:d,locale:f,nestingLevel:g,polymorphic:k,req:h,valueFrom:b,valueTo:i}):(0,e.jsx)(Q,{field:c,i18n:d,locale:f,nestingLevel:g,polymorphic:k,req:h,valueFrom:b,valueTo:i})}},T=({clientSchemaMap:a,customDiffComponents:b,entitySlug:c,fields:d,fieldsPermissions:e,i18n:f,modifiedOnly:g,nestingLevel:h=0,parentIndexPath:i,parentIsLocalized:j,parentPath:k,parentSchemaPath:l,req:m,selectedLocales:n,versionFromSiblingData:o,versionToSiblingData:p})=>{let q=[],r=-1;for(let s of d){if(r++,(0,u.fieldIsID)(s))continue;let{indexPath:d,path:t,schemaPath:w}=(0,v.getFieldPaths)({field:s,index:r,parentIndexPath:i,parentPath:k,parentSchemaPath:l}),x=a.get(c+"."+w);if(!x)throw m.payload.logger.error({clientFieldKey:c+"."+w,clientSchemaMapKeys:Array.from(a.keys()),msg:"No client field found for "+c+"."+w,parentPath:k,parentSchemaPath:l,path:t,schemaPath:w}),Error("No client field found for "+c+"."+w);let y={},z=(0,u.fieldShouldBeLocalized)({field:s,parentIsLocalized:j}),A="name"in s?s.name:null,B=A?o?.[A]:o,C=A?p?.[A]:p;if(z)for(let i of(y.fieldByLocale={},n)){let j=U({clientField:x,clientSchemaMap:a,customDiffComponents:b,entitySlug:c,field:s,i18n:f,indexPath:d,locale:i,modifiedOnly:g,nestingLevel:h,parentFieldsPermissions:e,parentIsLocalized:!0,parentPath:k,parentSchemaPath:l,path:t,req:m,schemaPath:w,selectedLocales:n,valueFrom:B?.[i],valueTo:C?.[i]});j&&(y.fieldByLocale[i]=j)}else{let i=U({clientField:x,clientSchemaMap:a,customDiffComponents:b,entitySlug:c,field:s,i18n:f,indexPath:d,modifiedOnly:g,nestingLevel:h,parentFieldsPermissions:e,parentIsLocalized:j||"localized"in s&&s.localized,parentPath:k,parentSchemaPath:l,path:t,req:m,schemaPath:w,selectedLocales:n,valueFrom:B,valueTo:C});i&&(y.field=i)}(y.field||y.fieldByLocale&&Object.keys(y.fieldByLocale).length)&&q.push(y)}return{versionFields:q}},U=({clientField:a,clientSchemaMap:b,customDiffComponents:c,entitySlug:d,field:e,i18n:f,indexPath:g,locale:h,modifiedOnly:i,nestingLevel:j,parentFieldsPermissions:k,parentIsLocalized:l,parentPath:m,parentSchemaPath:n,path:o,req:p,schemaPath:q,selectedLocales:w,valueFrom:x,valueTo:y})=>{let z,A=!1;if("boolean"==typeof k?(A=k,z=k):"name"in e?"boolean"==typeof(z=k?.[e.name])?A=z:"boolean"==typeof z?.read&&(A=z.read):A=!0,!A||i&&(0,s.dequal)(x,y))return null;let B=c?.[e.type];if(e?.type==="richText"){if(!e?.editor)throw new t.MissingEditorProp(e);if("function"==typeof e?.editor)throw Error("Attempted to access unsanitized rich text editor.");e.editor.CellComponent&&(B=e.editor.DiffComponent)}e?.admin?.components?.Diff&&(B=e.admin.components.Diff);let C=S?.[e.type],D={type:e.type,fields:[],path:o,schemaPath:q};if("tabs"===e.type&&"tabs"in e){D.tabs=[];let a=-1;for(let h of e.tabs){let n;a++;let r=(0,u.tabHasName)(h),s={...h,type:"tab"},{indexPath:t,path:z,schemaPath:A}=(0,v.getFieldPaths)({field:s,index:a,parentIndexPath:g,parentPath:o,parentSchemaPath:q});if("boolean"==typeof k)n=k;else if("name"in h){let a=k?.[h.name];n="boolean"==typeof a?a:a?.fields}else n=k;let B={name:"name"in h?h.name:null,fields:T({clientSchemaMap:b,customDiffComponents:c,entitySlug:d,fields:h.fields,fieldsPermissions:n,i18n:f,modifiedOnly:i,nestingLevel:j+1,parentIndexPath:r?"":t,parentIsLocalized:l||h.localized,parentPath:r?z:"name"in e?o:m,parentSchemaPath:A,req:p,selectedLocales:w,versionFromSiblingData:"name"in h?x?.[h.name]:x,versionToSiblingData:"name"in h?y?.[h.name]:y}).versionFields,label:"function"==typeof h.label?h.label({i18n:f,t:f.t}):h.label};B?.fields?.length&&D.tabs.push(B)}if(i&&!D.tabs.length)return null}else if("fields"in e){let a;if(a="name"in e&&void 0!==z?"boolean"==typeof z?z:z.fields:k,"array"===e.type&&(y||x)){let h=Math.max(Array.isArray(y)?y.length:0,Array.isArray(x)?x.length:0);D.rows=[];for(let k=0;k<h;k++){let h=Array.isArray(x)&&x?.[k]||{},n=Array.isArray(y)&&y?.[k]||{},r=T({clientSchemaMap:b,customDiffComponents:c,entitySlug:d,fields:e.fields,fieldsPermissions:a,i18n:f,modifiedOnly:i,nestingLevel:j+1,parentIndexPath:"name"in e?"":g,parentIsLocalized:l||e.localized,parentPath:("name"in e?o:m)+"."+k,parentSchemaPath:q,req:p,selectedLocales:w,versionFromSiblingData:h,versionToSiblingData:n}).versionFields;r?.length&&(D.rows[k]=r)}if(!D.rows?.length&&i)return null}else if(D.fields=T({clientSchemaMap:b,customDiffComponents:c,entitySlug:d,fields:e.fields,fieldsPermissions:a,i18n:f,modifiedOnly:i,nestingLevel:"row"!==e.type?j+1:j,parentIndexPath:"name"in e?"":g,parentIsLocalized:l||"localized"in e&&e.localized,parentPath:"name"in e?o:m,parentSchemaPath:q,req:p,selectedLocales:w,versionFromSiblingData:x,versionToSiblingData:y}).versionFields,i&&!D.fields?.length)return null}else if("blocks"===e.type){D.rows=[];let a=Math.max(Array.isArray(y)?y.length:0,Array.isArray(x)?x.length:0);for(let h=0;h<a;h++){let a,k=Array.isArray(x)&&x?.[h]||{},n=Array.isArray(y)&&y?.[h]||{},r=n?.blockType??k?.blockType,s=p.payload.blocks[r]??(e.blockReferences??e.blocks).find(a=>"string"!=typeof a&&a.slug===r),t=[];if(n.blockType===k.blockType)t=s.fields;else{let a=n?.blockType??k?.blockType,b=p.payload.blocks[a]??(e.blockReferences??e.blocks).find(b=>"string"!=typeof b&&b.slug===a);t=b?function(a,b){return[...new Map(a.map(a=>[a[b],a])).values()]}([...s.fields,...b.fields],"name"):s.fields}if("boolean"==typeof z)a=z;else if("boolean"==typeof z?.blocks)a=z.blocks;else{let b=z?.blocks?.[r];a="boolean"==typeof b?b:b?.fields}let u=T({clientSchemaMap:b,customDiffComponents:c,entitySlug:d,fields:t,fieldsPermissions:a,i18n:f,modifiedOnly:i,nestingLevel:j+1,parentIndexPath:"name"in e?"":g,parentIsLocalized:l||"localized"in e&&e.localized,parentPath:("name"in e?o:m)+"."+h,parentSchemaPath:q+"."+s.slug,req:p,selectedLocales:w,versionFromSiblingData:k,versionToSiblingData:n}).versionFields;u?.length&&(D.rows[h]=u)}if(!D.rows?.length&&i)return null}let E={baseVersionField:{...D,CustomComponent:void 0},comparisonValue:x,diffMethod:"diffWordsWithSpace",field:a,fieldPermissions:void 0===z?k:z,parentIsLocalized:l,nestingLevel:j||void 0,versionValue:y};h&&(E.locale=h);let F={...E,clientField:a,field:e,i18n:f,req:p,selectedLocales:w};return D.CustomComponent=(0,r.RenderServerComponent)({clientProps:E,Component:B,Fallback:C,importMap:p.payload.importMap,key:"diff component",serverProps:F}),D};var V=a.i(713117),W=a.i(413508);async function X(a){let{hasPublishedDoc:b,i18n:c,initPageResult:d,routeSegments:n,searchParams:r}=a,{collectionConfig:s,docID:t,globalConfig:u,permissions:v,req:w,req:{payload:x,payload:{config:y,config:{localization:z}}={},user:A}={}}=d,B=n[n.length-1],C=s?.slug,D=u?.slug,E=(0,k.hasDraftsEnabled)(s||u),F=r.locale||("all"!==w.locale?w.locale:z&&z.defaultLocale),G=r.localeCodes?JSON.parse(r.localeCodes):null,H=r.versionFrom,I="false"!==r.modifiedOnly,J=C?v.collections[C]:v.globals[D],K=await o({id:B,collectionSlug:C,depth:1,globalSlug:D,locale:"all",overrideAccess:!1,req:w,user:A});if(!K)return(0,j.notFound)();let[L,M,N,O,P]=await Promise.all([p({collectionSlug:C,depth:+!H,draft:!0,globalSlug:D,limit:1,locale:"all",overrideAccess:!1,parentID:t,req:w,sort:"-updatedAt",user:A,where:{and:[{updatedAt:{less_than:K.updatedAt}}]}}),H?o({id:H,collectionSlug:C,depth:1,globalSlug:D,locale:"all",overrideAccess:!1,req:w,user:A}):Promise.resolve(null),b?q({collectionSlug:C,depth:0,globalSlug:D,locale:w.locale,overrideAccess:!1,parentID:t,req:w,status:"published",user:A}):Promise.resolve(null),E?q({collectionSlug:C,depth:0,globalSlug:D,locale:"all",overrideAccess:!1,parentID:t,req:w,status:"draft",user:A}):Promise.resolve(null),E?p({collectionSlug:C,depth:0,draft:!0,globalSlug:D,limit:1,locale:"all",overrideAccess:!1,parentID:t,req:w,sort:"-updatedAt",user:A,where:{and:[{updatedAt:{less_than:K.updatedAt}},{"version._status":{equals:"published"}}]}}):Promise.resolve(null)]),Q=L?.docs?.[0]??null,R=M||Q,S=P?.docs?.[0]??null,U=[];if(z){let a=[];if(G)for(let b of G){let c=z.locales.find(a=>a.code===b);c&&a.push(c)}else a=z.locales;z.filterAvailableLocales&&(a=await z.filterAvailableLocales({locales:a,req:w})||[]),U=a.map(a=>a.code)}let X=(0,i.getSchemaMap)({collectionSlug:C,config:y,globalSlug:D,i18n:c}),Y=(a=>{let{versionFields:b}=T(a);return(0,e.jsx)(V.RenderVersionFieldsToDiff,{parent:!0,versionFields:b})})({clientSchemaMap:(0,h.getClientSchemaMap)({collectionSlug:C,config:(0,g.getClientConfig)({config:x.config,i18n:c,importMap:x.importMap,user:A}),globalSlug:D,i18n:c,payload:x,schemaMap:X}),customDiffComponents:{},entitySlug:C||D,fields:(s||u)?.fields,fieldsPermissions:J?.fields,i18n:c,modifiedOnly:I,parentIndexPath:"",parentIsLocalized:!1,parentPath:"",parentSchemaPath:"",req:w,selectedLocales:U,versionFromSiblingData:{...R?.version,updatedAt:R?.updatedAt},versionToSiblingData:{...K.version,updatedAt:K.updatedAt}}),Z=K.updatedAt?(0,f.formatDate)({date:"string"==typeof K.updatedAt?new Date(K.updatedAt):K.updatedAt,i18n:c,pattern:y.admin.dateFormat}):"",$=({doc:a,labelOverride:b,labelStyle:c,labelSuffix:d})=>(0,e.jsx)(W.VersionPillLabel,{currentlyPublishedVersion:N,doc:a,labelFirst:!0,labelOverride:b,labelStyle:c??"text",labelSuffix:d,latestDraftVersion:O},a.id),_=[];Q?.id&&_.push({doc:Q,labelOverride:c.t("version:previousVersion"),updatedAt:new Date(Q.updatedAt),value:Q.id});let aa=N?.updatedAt>O?.updatedAt;O&&!aa&&_.push({doc:O,updatedAt:new Date(O.updatedAt),value:O.id}),N&&_.push({doc:N,updatedAt:new Date(N.updatedAt),value:N.id}),S&&N?.id!==S.id&&_.push({doc:S,labelOverride:c.t("version:previouslyPublished"),updatedAt:new Date(S.updatedAt),value:S.id}),R?.id&&!_.some(a=>a.value===R.id)&&_.push({doc:R,labelOverride:c.t("version:specificVersion"),updatedAt:new Date(R.updatedAt),value:R.id}),_=_.sort((a,b)=>a&&b?b.updatedAt.getTime()-a.updatedAt.getTime():0);let ab=R?.id===K.id,ac=[];for(let a of _){if(a.value===K.id&&!ab||ac.some(b=>b.value===a.value))continue;let b=_.filter(b=>b.value===a.value&&b!==a),d=b?.length?(0,e.jsxs)("span",{children:[" (",b.map((a,b)=>{let d=a.labelOverride||function({currentLocale:a,currentlyPublishedVersion:b,latestDraftVersion:c,t:d,version:e}){let f=e.version._status;if("draft"===f){if(b?.updatedAt>c?.updatedAt)return{name:"draft",label:d("version:draft"),pillStyle:"light"};let a=e.id===c?.id;return{name:a?"currentDraft":"draft",label:d(a?"version:currentDraft":"version:draft"),pillStyle:"light"}}if("published"===f&&e.publishedLocale&&a!==e.publishedLocale)return{name:"currentDraft",label:d("version:currentDraft"),pillStyle:"light"};let g=b&&e.id===b.id;return{name:g?"currentlyPublished":"previouslyPublished",label:d(g?"version:currentlyPublished":"version:previouslyPublished"),pillStyle:g?"success":"light"}}({currentLocale:F,currentlyPublishedVersion:N,latestDraftVersion:O,t:c.t,version:a.doc}).label;return(0,e.jsxs)(l.default.Fragment,{children:[b>0?", ":"",d]},`${a.value}-${b}`)}),")"]},`${a.value}-suffix`):void 0;ac.push({label:$({doc:a.doc,labelOverride:a.labelOverride,labelSuffix:d}),value:a.value})}return(0,e.jsx)(m.DefaultVersionView,{canUpdate:J?.update,modifiedOnly:I,RenderedDiff:Y,selectedLocales:U,versionFromCreatedAt:R?.createdAt,versionFromID:R?.id,versionFromOptions:ac,versionToCreatedAt:K.createdAt,versionToCreatedAtFormatted:Z,VersionToCreatedAtLabel:$({doc:K,labelStyle:"pill"}),versionToID:K.id,versionToStatus:K.version?._status})}var Y=a.i(728309),Z=a.i(911082),$=a.i(720245),_=a.i(774610),aa=a.i(683226),ab=a.i(427422),ac=a.i(389529),ad=a.i(697332);let ae="versions";async function af(a){let{hasPublishedDoc:b,initPageResult:{collectionConfig:c,docID:d,globalConfig:f,req:g,req:{i18n:h,payload:{config:i},t:m,user:n}},routeSegments:o,searchParams:{limit:r,page:s,sort:t},versions:{disableGutter:u=!1,useVersionDrawerCreatedAtCell:v=!1}={}}=a,w=(0,k.hasDraftsEnabled)(c||f),x=c?.slug,y=f?.slug,z="trash"===o[2],{localization:A,routes:{api:B},serverURL:C}=i,D={and:[]};A&&w&&D.and.push({snapshot:{not_equals:!0}});let E=x?c?.admin?.pagination?.defaultLimit:10,F=(0,$.isNumber)(r)?Number(r):E,G=await p({collectionSlug:x,depth:0,globalSlug:y,limit:F,locale:g.locale,overrideAccess:!1,page:s?parseInt(s.toString(),10):void 0,parentID:d,req:g,sort:t,user:n,where:D});if(!G)return(0,j.notFound)();let[H,I]=await Promise.all([b?q({collectionSlug:x,depth:0,globalSlug:y,locale:g.locale,overrideAccess:!1,parentID:d,req:g,select:{id:!0,updatedAt:!0,version:{_status:!0,updatedAt:!0}},status:"published",user:n,where:A?{snapshot:{not_equals:!0}}:void 0}):Promise.resolve(null),w?q({collectionSlug:x,depth:0,globalSlug:y,locale:g.locale,overrideAccess:!1,parentID:d,req:g,select:{id:!0,updatedAt:!0,version:{_status:!0,updatedAt:!0}},status:"draft",user:n,where:A?{snapshot:{not_equals:!0}}:void 0}):Promise.resolve(null)]),J=(0,Z.formatAdminURL)({apiRoute:B,path:x?`/${x}/versions`:`/${y}/versions`}),K=(({collectionConfig:a,CreatedAtCellOverride:b,currentlyPublishedVersion:c,docID:d,docs:f,globalConfig:g,i18n:{t:h},isTrashed:i,latestDraftVersion:j})=>{let l=a||g,m=b??ab.CreatedAtCell,n=[{accessor:"updatedAt",active:!0,field:{name:"",type:"date"},Heading:(0,e.jsx)(Y.SortColumn,{Label:h("general:updatedAt"),name:"updatedAt"}),renderedCells:f.map((b,c)=>(0,e.jsx)(m,{collectionSlug:a?.slug,docID:d,globalSlug:g?.slug,isTrashed:i,rowData:{id:b.id,updatedAt:b.updatedAt}},c))},{accessor:"id",active:!0,field:{name:"",type:"text"},Heading:(0,e.jsx)(Y.SortColumn,{disable:!0,Label:h("version:versionID"),name:"id"}),renderedCells:f.map((a,b)=>(0,e.jsx)(ac.IDCell,{id:a.id},b))}];return(0,k.hasDraftsEnabled)(l)&&n.push({accessor:"_status",active:!0,field:{name:"",type:"checkbox"},Heading:(0,e.jsx)(Y.SortColumn,{disable:!0,Label:h("version:status"),name:"status"}),renderedCells:f.map((a,b)=>(0,e.jsx)(aa.AutosaveCell,{currentlyPublishedVersion:c,latestDraftVersion:j,rowData:a},b))}),n})({collectionConfig:c,CreatedAtCellOverride:v?_.VersionDrawerCreatedAtCell:void 0,currentlyPublishedVersion:H,docID:d,docs:G?.docs,globalConfig:f,i18n:h,isTrashed:z,latestDraftVersion:I}),L="function"==typeof c?.labels?.plural?c.labels.plural({i18n:h,t:m}):c?.labels?.plural??f?.label,M=u?l.default.Fragment:Y.Gutter;return(0,e.jsxs)(l.default.Fragment,{children:[(0,e.jsx)(Y.SetDocumentStepNav,{collectionSlug:x,globalSlug:y,id:d,isTrashed:z,pluralLabel:L,useAsTitle:c?.admin?.useAsTitle||y,view:h.t("version:versions")}),(0,e.jsx)("main",{className:ae,children:(0,e.jsx)(M,{className:`${ae}__wrap`,children:(0,e.jsx)(Y.ListQueryProvider,{data:G,modifySearchParams:!0,orderableFieldName:c?.orderable===!0?"_order":void 0,query:{limit:F,sort:t},children:(0,e.jsx)(ad.VersionsViewClient,{baseClass:ae,columns:K,fetchURL:J,paginationLimits:c?.admin?.pagination?.limits})})})})]})}let ag=(a,b)=>"object"==typeof a?.edit?.[b]&&"Component"in a.edit[b]?a?.edit?.[b].Component:null;function ah(a){return a.replace(/([.+*?=^!:${}()[\]|/\\])/g,"\\$1")}function ai(a){return a&&a.sensitive?"":"i"}let aj=({currentRoute:a,exact:b,path:c,sensitive:d,strict:e})=>{if(!c)return!1;let f=(function a(b,c,d){if(b instanceof RegExp){var e;if(!c)return b;for(var f=/\((?:\?<(.*?)>)?(?!\?)/g,g=0,h=f.exec(b.source);h;)c.push({name:h[1]||g++,prefix:"",suffix:"",modifier:"",pattern:""}),h=f.exec(b.source);return b}return Array.isArray(b)?(e=b.map(function(b){return a(b,c,d).source}),new RegExp("(?:".concat(e.join("|"),")"),ai(d))):function(a,b,c){void 0===c&&(c={});for(var d=c.strict,e=void 0!==d&&d,f=c.start,g=c.end,h=c.encode,i=void 0===h?function(a){return a}:h,j=c.delimiter,k=c.endsWith,l="[".concat(ah(void 0===k?"":k),"]|$"),m="[".concat(ah(void 0===j?"/#?":j),"]"),n=void 0===f||f?"^":"",o=0;o<a.length;o++){var p=a[o];if("string"==typeof p)n+=ah(i(p));else{var q=ah(i(p.prefix)),r=ah(i(p.suffix));if(p.pattern)if(b&&b.push(p),q||r)if("+"===p.modifier||"*"===p.modifier){var s="*"===p.modifier?"?":"";n+="(?:".concat(q,"((?:").concat(p.pattern,")(?:").concat(r).concat(q,"(?:").concat(p.pattern,"))*)").concat(r,")").concat(s)}else n+="(?:".concat(q,"(").concat(p.pattern,")").concat(r,")").concat(p.modifier);else{if("+"===p.modifier||"*"===p.modifier)throw TypeError('Can not repeat "'.concat(p.name,'" without a prefix and suffix'));n+="(".concat(p.pattern,")").concat(p.modifier)}else n+="(?:".concat(q).concat(r,")").concat(p.modifier)}}if(void 0===g||g)e||(n+="".concat(m,"?")),n+=c.endsWith?"(?=".concat(l,")"):"$";else{var t=a[a.length-1],u="string"==typeof t?m.indexOf(t[t.length-1])>-1:void 0===t;e||(n+="(?:".concat(m,"(?=").concat(l,"))?")),u||(n+="(?=".concat(m,"|").concat(l,")"))}return new RegExp(n,ai(c))}(function(a,b){void 0===b&&(b={});for(var c=function(a){for(var b=[],c=0;c<a.length;){var d=a[c];if("*"===d||"+"===d||"?"===d){b.push({type:"MODIFIER",index:c,value:a[c++]});continue}if("\\"===d){b.push({type:"ESCAPED_CHAR",index:c++,value:a[c++]});continue}if("{"===d){b.push({type:"OPEN",index:c,value:a[c++]});continue}if("}"===d){b.push({type:"CLOSE",index:c,value:a[c++]});continue}if(":"===d){for(var e="",f=c+1;f<a.length;){var g=a.charCodeAt(f);if(g>=48&&g<=57||g>=65&&g<=90||g>=97&&g<=122||95===g){e+=a[f++];continue}break}if(!e)throw TypeError("Missing parameter name at ".concat(c));b.push({type:"NAME",index:c,value:e}),c=f;continue}if("("===d){var h=1,i="",f=c+1;if("?"===a[f])throw TypeError('Pattern cannot start with "?" at '.concat(f));for(;f<a.length;){if("\\"===a[f]){i+=a[f++]+a[f++];continue}if(")"===a[f]){if(0==--h){f++;break}}else if("("===a[f]&&(h++,"?"!==a[f+1]))throw TypeError("Capturing groups are not allowed at ".concat(f));i+=a[f++]}if(h)throw TypeError("Unbalanced pattern at ".concat(c));if(!i)throw TypeError("Missing pattern at ".concat(c));b.push({type:"PATTERN",index:c,value:i}),c=f;continue}b.push({type:"CHAR",index:c,value:a[c++]})}return b.push({type:"END",index:c,value:""}),b}(a),d=b.prefixes,e=void 0===d?"./":d,f=b.delimiter,g=void 0===f?"/#?":f,h=[],i=0,j=0,k="",l=function(a){if(j<c.length&&c[j].type===a)return c[j++].value},m=function(a){var b=l(a);if(void 0!==b)return b;var d=c[j],e=d.type,f=d.index;throw TypeError("Unexpected ".concat(e," at ").concat(f,", expected ").concat(a))},n=function(){for(var a,b="";a=l("CHAR")||l("ESCAPED_CHAR");)b+=a;return b},o=function(a){for(var b=0;b<g.length;b++){var c=g[b];if(a.indexOf(c)>-1)return!0}return!1},p=function(a){var b=h[h.length-1],c=a||(b&&"string"==typeof b?b:"");if(b&&!c)throw TypeError('Must have text between two parameters, missing text after "'.concat(b.name,'"'));return!c||o(c)?"[^".concat(ah(g),"]+?"):"(?:(?!".concat(ah(c),")[^").concat(ah(g),"])+?")};j<c.length;){var q=l("CHAR"),r=l("NAME"),s=l("PATTERN");if(r||s){var t=q||"";-1===e.indexOf(t)&&(k+=t,t=""),k&&(h.push(k),k=""),h.push({name:r||i++,prefix:t,suffix:"",pattern:s||p(t),modifier:l("MODIFIER")||""});continue}var u=q||l("ESCAPED_CHAR");if(u){k+=u;continue}if(k&&(h.push(k),k=""),l("OPEN")){var t=n(),v=l("NAME")||"",w=l("PATTERN")||"",x=n();m("CLOSE"),h.push({name:v||(w?i++:""),pattern:v&&!w?p(t):w,prefix:t,suffix:x,modifier:l("MODIFIER")||""});continue}m("END")}return h}(b,d),c,d)})(c,[],{sensitive:d,strict:e}).exec(a),g=f?.[0]||c;if(b)return a===g;if(!b){if(!a.startsWith(g))return!1;let b=a.slice(g.length);return""===b||b.startsWith("/")}};a.s(["isPathMatchingRoute",0,aj],390529);let ak=({baseRoute:a,currentRoute:b,views:c})=>{if("object"==typeof c?.edit){let d,e=Object.entries(c.edit).find(([c,e])=>{if("object"==typeof e&&"path"in e){let f=aj({currentRoute:b,exact:!0,path:`${a}${e.path}`});return f&&(d=c),f}return!1})?.[1];if(e&&"Component"in e)return{Component:e.Component,viewKey:d}}return{Component:null}};a.s(["getDocumentView",0,({collectionConfig:a,config:e,docPermissions:f,globalConfig:g,routeSegments:h})=>{let i,j=null,{routes:{admin:k}}=e,l=a&&a?.admin?.components?.views||g&&g?.admin?.components?.views;if(!f?.read)throw Error("not-found");if(a){let[e,g,m,n,o,...p]=h;switch(h.length){case 3:if("create"===m)j="create"in f&&f.create?ag(l,"default")||c.EditView:d.UnauthorizedViewWithGutter;else{let a=["/"!==k&&k,"collections",g,m].filter(Boolean).join("/"),b=[a,n,o,...p].filter(Boolean).join("/"),{Component:d,viewKey:e}=ak({baseRoute:a,currentRoute:b,views:l});e?(i=e,j=d):j=ag(l,"default")||c.EditView}break;case 4:if("trash"===m&&n){j=ag(l,"default")||c.EditView;break}switch(n){case"api":a?.admin?.hideAPIURL!==!0&&(j=ag(l,"api")||b.APIView);break;case"versions":j=f?.readVersions?ag(l,"versions")||af:d.UnauthorizedViewWithGutter;break;default:{let a=["/"!==k&&k,"collections",g,m].filter(Boolean).join("/"),b=[a,n,o,...p].filter(Boolean).join("/"),{Component:c,viewKey:d}=ak({baseRoute:a,currentRoute:b,views:l});d&&(i=d,j=c)}}break;case 5:if("trash"===m)switch(o){case"api":a?.admin?.hideAPIURL!==!0&&(j=ag(l,"api")||b.APIView);break;case"versions":j=f?.readVersions?ag(l,"versions")||af:d.UnauthorizedViewWithGutter;break;default:j=ag(l,"default")||c.EditView}else if("versions"===n)j=f?.readVersions?ag(l,"version")||X:d.UnauthorizedViewWithGutter;else{let a=["/"!==k&&k,e,g,m].filter(Boolean).join("/"),b=[a,n,o,...p].filter(Boolean).join("/"),{Component:c,viewKey:d}=ak({baseRoute:a,currentRoute:b,views:l});d&&(i=d,j=c)}break;default:if("trash"===m&&"versions"===o)j=f?.readVersions?ag(l,"version")||X:d.UnauthorizedViewWithGutter;else{let a=["/"!==k&&k,e,g,m].filter(Boolean).join("/"),b=[a,n,o,...p].filter(Boolean).join("/"),{Component:c,viewKey:d}=ak({baseRoute:a,currentRoute:b,views:l});d&&(i=d,j=c)}}}if(g){let[a,e,m,...n]=h;switch(h.length){case 2:j=ag(l,"default")||c.EditView;break;case 3:switch(m){case"api":g?.admin?.hideAPIURL!==!0&&(j=ag(l,"api")||b.APIView);break;case"versions":j=f?.readVersions?ag(l,"versions")||af:d.UnauthorizedViewWithGutter;break;default:if(f?.read){let b=[k,a,e,m].filter(Boolean).join("/"),d=[b,m,...n].filter(Boolean).join("/"),{Component:f,viewKey:g}=ak({baseRoute:b,currentRoute:d,views:l});g?(i=g,j=f):j=c.EditView}else j=d.UnauthorizedViewWithGutter}break;default:if("versions"===m)j=f?.readVersions?ag(l,"version")||X:d.UnauthorizedViewWithGutter;else{let a=["/"!==k&&k,"globals",e].filter(Boolean).join("/"),b=[a,m,...n].filter(Boolean).join("/"),{Component:c,viewKey:d}=ak({baseRoute:a,currentRoute:b,views:l});d&&(i=d,j=c)}}}return{View:j,viewKey:i}}],559652)},977157,a=>{"use strict";var b=a.i(977523),c=a.i(3455),d=a.i(277085),e=a.i(680130),f=a.i(92945),g=a.i(180805),h=a.i(559652);let i=async({collectionConfig:a,config:i,globalConfig:j,params:k})=>{let{segments:l}=k,m=null,[n]=l,o="collections"===n,p="globals"===n,q=p||!!(o&&l?.length>2&&"create"!==l[2]);if(o){if(3===k.segments.length&&(m=d.generateEditViewMetadata),4===l.length&&"trash"===l[2]&&(m=a=>(0,d.generateEditViewMetadata)({...a,isReadOnly:!0})),4===k.segments.length)switch(k.segments[3]){case"api":m=c.generateAPIViewMetadata;break;case"versions":m=g.generateVersionsViewMetadata}if(5===k.segments.length&&"versions"===k.segments[3]&&(m=f.generateVersionViewMetadata),5===l.length&&"trash"===l[2])switch(l[4]){case"api":m=c.generateAPIViewMetadata;break;case"versions":m=g.generateVersionsViewMetadata}6===l.length&&"trash"===l[2]&&"versions"===l[4]&&(m=f.generateVersionViewMetadata)}if(p){if(k.segments?.length===2&&(m=d.generateEditViewMetadata),k.segments?.length===3)switch(k.segments[2]){case"api":m=c.generateAPIViewMetadata;break;case"versions":m=g.generateVersionsViewMetadata}k.segments?.length===4&&"versions"===k.segments[2]&&(m=f.generateVersionViewMetadata)}let r=await (0,b.getNextRequestI18n)({config:i});if("function"==typeof m)return m({collectionConfig:a,config:i,globalConfig:j,i18n:r,isEditing:q});{let{viewKey:b}=(0,h.getDocumentView)({collectionConfig:a,config:i,docPermissions:{create:!0,delete:!0,fields:!0,read:!0,readVersions:!0,update:!0},globalConfig:j,routeSegments:"string"==typeof l?[l]:l});if(b&&(a?.admin?.components?.views?.edit?.[b]||j?.admin?.components?.views?.edit?.[b]))return(0,d.generateEditViewMetadata)({collectionConfig:a,config:i,globalConfig:j,i18n:r,isEditing:q,view:b})}return(0,e.generateNotFoundViewMetadata)({config:i,i18n:r})};a.s(["getMetaBySegment",0,i])},337272,a=>{"use strict";a.s(["EditView",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call EditView() from the server but EditView is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Edit/index.js","EditView")},520922,a=>{"use strict";var b=a.i(337272);a.n(b)},518419,a=>{"use strict";a.s(["NotFoundClient",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call NotFoundClient() from the server but NotFoundClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/NotFound/index.client.js","NotFoundClient")},667286,a=>{"use strict";var b=a.i(518419);a.n(b)},909785,715862,82446,a=>{"use strict";var b=a.i(907997),c=a.i(473060),d=a.i(911082),e=a.i(502764),f=a.i(801144);let g=Object.prototype.hasOwnProperty,h=Array.isArray,i={allowDots:!1,allowEmptyArrays:!1,allowPrototypes:!1,allowSparse:!1,arrayLimit:20,comma:!1,decodeDotInKeys:!1,decoder:f.decode,delimiter:"&",depth:5,duplicates:"combine",ignoreQueryPrefix:!1,parameterLimit:1e3,parseArrays:!0,plainObjects:!1,strictNullHandling:!1},j=function(a,b){return a&&"string"==typeof a&&b.comma&&a.indexOf(",")>-1?a.split(","):a},k=function(a,b){let c,d={__proto__:null},e=b.ignoreQueryPrefix?a.replace(/^\?/,""):a,k=b.parameterLimit===1/0?void 0:b.parameterLimit,l=e.split(b.delimiter,k);for(c=0;c<l.length;++c){let a,e,k=l[c],m=k.indexOf("]="),n=-1===m?k.indexOf("="):m+1;-1===n?(a=b.decoder(k,i.decoder,"key"),e=b.strictNullHandling?null:""):(a=b.decoder(k.slice(0,n),i.decoder,"key"),e=f.maybeMap(j(k.slice(n+1),b),function(a){return b.decoder(a,i.decoder,"value")})),k.indexOf("[]=")>-1&&(e=h(e)?[e]:e),b.comma&&h(e)&&e.length>b.arrayLimit&&(e=f.combine([],e,b.arrayLimit,b.plainObjects));let o=g.call(d,a);o&&"combine"===b.duplicates?d[a]=f.combine(d[a],e,b.arrayLimit,b.plainObjects):o&&"last"!==b.duplicates||(d[a]=e)}return d},l=function(a,b,c,d){let e=d?b:j(b,c);for(let b=a.length-1;b>=0;--b){let d,g=a[b];if("[]"===g&&c.parseArrays)d=f.isOverflow(e)?e:c.allowEmptyArrays&&(""===e||c.strictNullHandling&&null===e)?[]:f.combine([],e,c.arrayLimit,c.plainObjects);else{d=c.plainObjects?Object.create(null):{};let a="["===g.charAt(0)&&"]"===g.charAt(g.length-1)?g.slice(1,-1):g,b=c.decodeDotInKeys?a.replace(/%2E/g,"."):a,f=parseInt(b,10);c.parseArrays||""!==b?!isNaN(f)&&g!==b&&String(f)===b&&f>=0&&c.parseArrays&&f<=c.arrayLimit?(d=[])[f]=e:"__proto__"!==b&&(d[b]=e):d={0:e}}e=d}return e},m=function(a,b,c,d){if(!a)return;let e=c.allowDots?a.replace(/\.([^.[]+)/g,"[$1]"):a,f=/(\[[^[\]]*])/g,h=c.depth>0&&/(\[[^[\]]*])/.exec(e),i=h?e.slice(0,h.index):e,j=[];if(i){if(!c.plainObjects&&g.call(Object.prototype,i)&&!c.allowPrototypes)return;j.push(i)}let k=0;for(;c.depth>0&&null!==(h=f.exec(e))&&k<c.depth;){if(k+=1,!c.plainObjects&&g.call(Object.prototype,h[1].slice(1,-1))&&!c.allowPrototypes)return;j.push(h[1])}return h&&j.push("["+e.slice(h.index)+"]"),l(j,b,c,d)},n=function(a){if(!a)return i;if(void 0!==a.allowEmptyArrays&&"boolean"!=typeof a.allowEmptyArrays)throw TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");if(void 0!==a.decodeDotInKeys&&"boolean"!=typeof a.decodeDotInKeys)throw TypeError("`decodeDotInKeys` option can only be `true` or `false`, when provided");if(null!==a.decoder&&void 0!==a.decoder&&"function"!=typeof a.decoder)throw TypeError("Decoder has to be a function.");let b=void 0===a.duplicates?i.duplicates:a.duplicates;if("combine"!==b&&"first"!==b&&"last"!==b)throw TypeError("The duplicates option must be either combine, first, or last");return{allowDots:void 0===a.allowDots?!0===a.decodeDotInKeys||i.allowDots:!!a.allowDots,allowEmptyArrays:"boolean"==typeof a.allowEmptyArrays?!!a.allowEmptyArrays:i.allowEmptyArrays,allowPrototypes:"boolean"==typeof a.allowPrototypes?a.allowPrototypes:i.allowPrototypes,allowSparse:"boolean"==typeof a.allowSparse?a.allowSparse:i.allowSparse,arrayLimit:"number"==typeof a.arrayLimit?a.arrayLimit:i.arrayLimit,comma:"boolean"==typeof a.comma?a.comma:i.comma,decodeDotInKeys:"boolean"==typeof a.decodeDotInKeys?a.decodeDotInKeys:i.decodeDotInKeys,decoder:"function"==typeof a.decoder?a.decoder:i.decoder,delimiter:"string"==typeof a.delimiter||f.isRegExp(a.delimiter)?a.delimiter:i.delimiter,depth:"number"==typeof a.depth||!1===a.depth?+a.depth:i.depth,duplicates:b,ignoreQueryPrefix:!0===a.ignoreQueryPrefix,parameterLimit:"number"==typeof a.parameterLimit?a.parameterLimit:i.parameterLimit,parseArrays:!1!==a.parseArrays,plainObjects:"boolean"==typeof a.plainObjects?a.plainObjects:i.plainObjects,strictNullHandling:"boolean"==typeof a.strictNullHandling?a.strictNullHandling:i.strictNullHandling}};function o(a,b){let c=n(b);if(""===a||null==a)return c.plainObjects?Object.create(null):{};let d="string"==typeof a?k(a,c):a,e=c.plainObjects?Object.create(null):{},g=Object.keys(d);for(let b=0;b<g.length;++b){let h=g[b],i=m(h,d[h],c,"string"==typeof a);e=f.merge(e,i,c)}return!0===c.allowSparse?e:f.compact(e)}a.s(["parse",0,o],715862),a.i(800717);var p=a.i(728309),q=a.i(646096),r=a.i(840940),s=a.i(220185),t=a.i(592825),u=a.i(87452),v=a.i(375976);let w=async a=>{let{documentSubViewType:d,i18n:e,locale:f,params:g,payload:h,permissions:i,req:j,searchParams:k,user:l,viewType:m,visibleEntities:n}=a;if(!h?.config)return null;let{admin:{components:{afterNav:o,afterNavLinks:w,beforeNav:x,beforeNavLinks:y,logout:z,settingsMenu:A}},collections:B,globals:C}=h.config,D=(0,c.groupNavItems)([...B.filter(({slug:a})=>n.collections.includes(a)).map(a=>({type:c.EntityType.collection,entity:a})),...C.filter(({slug:a})=>n.globals.includes(a)).map(a=>({type:c.EntityType.global,entity:a}))],i,e),E=await (0,u.getNavPrefs)(j),F=(0,q.RenderServerComponent)({clientProps:{documentSubViewType:d,viewType:m},Component:z?.Button,Fallback:p.Logout,importMap:h.importMap,serverProps:{i18n:e,locale:f,params:g,payload:h,permissions:i,searchParams:k,user:l}}),G=A&&Array.isArray(A)?A.map((a,b)=>(0,q.RenderServerComponent)({clientProps:{documentSubViewType:d,viewType:m},Component:a,importMap:h.importMap,key:`settings-menu-item-${b}`,serverProps:{i18n:e,locale:f,params:g,payload:h,permissions:i,searchParams:k,user:l}})):[],H=(0,q.RenderServerComponent)({clientProps:{documentSubViewType:d,viewType:m},Component:x,importMap:h.importMap,serverProps:{i18n:e,locale:f,params:g,payload:h,permissions:i,searchParams:k,user:l}}),I=(0,q.RenderServerComponent)({clientProps:{documentSubViewType:d,viewType:m},Component:y,importMap:h.importMap,serverProps:{i18n:e,locale:f,params:g,payload:h,permissions:i,searchParams:k,user:l}}),J=(0,q.RenderServerComponent)({clientProps:{documentSubViewType:d,viewType:m},Component:w,importMap:h.importMap,serverProps:{i18n:e,locale:f,params:g,payload:h,permissions:i,searchParams:k,user:l}}),K=(0,q.RenderServerComponent)({clientProps:{documentSubViewType:d,viewType:m},Component:o,importMap:h.importMap,serverProps:{i18n:e,locale:f,params:g,payload:h,permissions:i,searchParams:k,user:l}});return(0,b.jsxs)(s.NavWrapper,{baseClass:"nav",children:[H,(0,b.jsxs)("nav",{className:"nav__wrap",children:[I,(0,b.jsx)(v.DefaultNavClient,{groups:D,navPreferences:E}),J,(0,b.jsxs)("div",{className:"nav__controls",children:[(0,b.jsx)(t.SettingsMenuButton,{settingsMenu:G}),F]})]}),K,(0,b.jsx)("div",{className:"nav__header",children:(0,b.jsx)("div",{className:"nav__header-content",children:(0,b.jsx)(r.NavHamburger,{baseClass:"nav"})})})]})};var x=a.i(50158),y=a.i(56486);let z="template-default",A=({children:a,className:c,collectionSlug:d,docID:e,documentSubViewType:f,globalSlug:g,i18n:h,locale:i,params:j,payload:k,permissions:l,req:m,searchParams:n,user:o,viewActions:r,viewType:s,visibleEntities:t})=>{let{admin:{avatar:u,components:v,components:{header:A,Nav:B}={header:void 0,Nav:void 0}}={}}=k.config||{},C={documentSubViewType:f,viewType:s,visibleEntities:t},D={collectionSlug:d,docID:e,globalSlug:g,i18n:h,locale:i,params:j,payload:k,permissions:l,req:m,searchParams:n,user:o},E={};for(let a of r??[])a&&(E["object"==typeof a?a.path:a]=(0,q.RenderServerComponent)({clientProps:C,Component:a,importMap:k.importMap,serverProps:D}));let F=(0,q.RenderServerComponent)({clientProps:C,Component:B,Fallback:w,importMap:k.importMap,serverProps:D});return(0,b.jsx)(p.EntityVisibilityProvider,{visibleEntities:t,children:(0,b.jsx)(p.BulkUploadProvider,{drawerSlugPrefix:d,children:(0,b.jsxs)(p.ActionsProvider,{Actions:E,children:[(0,q.RenderServerComponent)({clientProps:C,Component:A,importMap:k.importMap,serverProps:D}),(0,b.jsxs)("div",{style:{position:"relative"},children:[(0,b.jsx)("div",{className:`${z}__nav-toggler-wrapper`,id:"nav-toggler",children:(0,b.jsx)("div",{className:`${z}__nav-toggler-container`,id:"nav-toggler",children:(0,b.jsx)(p.NavToggler,{className:`${z}__nav-toggler`,children:(0,b.jsx)(x.NavHamburger,{})})})}),(0,b.jsxs)(y.Wrapper,{baseClass:z,className:c,children:[F,(0,b.jsxs)("div",{className:`${z}__wrap`,children:[(0,b.jsx)(p.AppHeader,{CustomAvatar:"gravatar"!==u&&"default"!==u?(0,q.RenderServerComponent)({Component:u.Component,importMap:k.importMap,serverProps:D}):void 0,CustomIcon:v?.graphics?.Icon?(0,q.RenderServerComponent)({Component:v.graphics.Icon,importMap:k.importMap,serverProps:D}):void 0}),a]})]})]})]})})})};a.s(["DefaultTemplate",0,A],82446),a.i(977523);var B=a.i(996512),C=a.i(667286);let D=async({config:a,importMap:f,params:g,searchParams:h})=>{let i=await a,{routes:{admin:j}={}}=i,k=await h,l=`${e.stringify(k??{},{addQueryPrefix:!0})}`,{locale:m,permissions:n,req:p,req:{payload:q}}=await (0,B.initReq)({configPromise:i,importMap:f,key:"RootLayout",overrides:{fallbackLocale:!1,req:{query:o(l,{depth:10,ignoreQueryPrefix:!0})},urlSuffix:`${(0,d.formatAdminURL)({adminRoute:j,path:"/not-found"})}${k?l:""}`}});if(!p.user||!n.canAccessAdmin)return(0,b.jsx)(C.NotFoundClient,{});let r=await g,s=(0,c.getVisibleEntities)({req:p});return(0,b.jsx)(A,{i18n:p.i18n,locale:m,params:r,payload:q,permissions:n,searchParams:k,user:p.user,visibleEntities:s,children:(0,b.jsx)(C.NotFoundClient,{})})};a.s(["NotFoundPage",0,D,"NotFoundView",0,function(a){return(0,b.jsx)(C.NotFoundClient,{marginTop:"large"})}],909785)},383209,a=>{"use strict";a.s(["DefaultVersionView",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call DefaultVersionView() from the server but DefaultVersionView is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/Default/index.js","DefaultVersionView")},528613,a=>{"use strict";var b=a.i(383209);a.n(b)},636592,a=>{"use strict";a.s(["RenderVersionFieldsToDiff",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call RenderVersionFieldsToDiff() from the server but RenderVersionFieldsToDiff is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/RenderVersionFieldsToDiff.js","RenderVersionFieldsToDiff")},713117,a=>{"use strict";var b=a.i(636592);a.n(b)},524329,a=>{"use strict";a.s(["Collapsible",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Collapsible() from the server but Collapsible is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/fields/Collapsible/index.js","Collapsible")},544330,a=>{"use strict";var b=a.i(524329);a.n(b)},868752,a=>{"use strict";a.s(["DateDiffComponent",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call DateDiffComponent() from the server but DateDiffComponent is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/fields/Date/index.js","DateDiffComponent")},766721,a=>{"use strict";var b=a.i(868752);a.n(b)},377422,a=>{"use strict";a.s(["Group",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Group() from the server but Group is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/fields/Group/index.js","Group")},616078,a=>{"use strict";var b=a.i(377422);a.n(b)},175242,a=>{"use strict";a.s(["Iterable",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Iterable() from the server but Iterable is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/fields/Iterable/index.js","Iterable")},808253,a=>{"use strict";var b=a.i(175242);a.n(b)},868586,a=>{"use strict";a.s(["Row",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Row() from the server but Row is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/fields/Row/index.js","Row")},420103,a=>{"use strict";var b=a.i(868586);a.n(b)},361582,a=>{"use strict";a.s(["Select",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Select() from the server but Select is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/fields/Select/index.js","Select")},331327,a=>{"use strict";var b=a.i(361582);a.n(b)},566889,a=>{"use strict";a.s(["Tabs",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Tabs() from the server but Tabs is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/fields/Tabs/index.js","Tabs")},3454,a=>{"use strict";var b=a.i(566889);a.n(b)},243928,a=>{"use strict";a.s(["Text",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Text() from the server but Text is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/RenderFieldsToDiff/fields/Text/index.js","Text")},990820,a=>{"use strict";var b=a.i(243928);a.n(b)},544876,a=>{"use strict";a.s(["VersionDrawerCreatedAtCell",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call VersionDrawerCreatedAtCell() from the server but VersionDrawerCreatedAtCell is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/SelectComparison/VersionDrawer/CreatedAtCell.js","VersionDrawerCreatedAtCell")},774610,a=>{"use strict";var b=a.i(544876);a.n(b)},723628,a=>{"use strict";a.s(["VersionPillLabel",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call VersionPillLabel() from the server but VersionPillLabel is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Version/VersionPillLabel/VersionPillLabel.js","VersionPillLabel")},413508,a=>{"use strict";var b=a.i(723628);a.n(b)},387058,a=>{"use strict";a.s(["AutosaveCell",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call AutosaveCell() from the server but AutosaveCell is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Versions/cells/AutosaveCell/index.js","AutosaveCell")},683226,a=>{"use strict";var b=a.i(387058);a.n(b)},86286,a=>{"use strict";a.s(["CreatedAtCell",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call CreatedAtCell() from the server but CreatedAtCell is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Versions/cells/CreatedAt/index.js","CreatedAtCell")},427422,a=>{"use strict";var b=a.i(86286);a.n(b)},119037,a=>{"use strict";a.s(["IDCell",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call IDCell() from the server but IDCell is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Versions/cells/ID/index.js","IDCell")},389529,a=>{"use strict";var b=a.i(119037);a.n(b)},62313,a=>{"use strict";a.s(["VersionsViewClient",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call VersionsViewClient() from the server but VersionsViewClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/next/dist/views/Versions/index.client.js","VersionsViewClient")},697332,a=>{"use strict";var b=a.i(62313);a.n(b)},562039,a=>{"use strict";a.s(["$createAutoLinkNode",()=>c,"$createBlockNode",()=>d,"$createHorizontalRuleNode",()=>e,"$createInlineBlockNode",()=>f,"$createLinkNode",()=>g,"$createRelationshipNode",()=>h,"$createUploadNode",()=>i,"$isAutoLinkNode",()=>j,"$isBlockNode",()=>k,"$isHorizontalRuleNode",()=>l,"$isInlineBlockNode",()=>m,"$isLinkNode",()=>n,"$isRelationshipNode",()=>o,"$isUploadNode",()=>p,"AlignFeatureClient",()=>q,"AutoLinkNode",()=>r,"BlockCollapsible",()=>s,"BlockEditButton",()=>t,"BlockNode",()=>u,"BlockRemoveButton",()=>v,"BlockquoteFeatureClient",()=>w,"BlocksFeatureClient",()=>x,"BoldFeatureClient",()=>y,"CAN_USE_DOM",()=>z,"ChecklistFeatureClient",()=>A,"CodeBlockBlockComponent",()=>B,"CodeComponent",()=>C,"DETAIL_TYPE_TO_DETAIL",()=>D,"DOUBLE_LINE_BREAK",()=>E,"DebugJsxConverterFeatureClient",()=>F,"ELEMENT_FORMAT_TO_TYPE",()=>G,"ELEMENT_TYPE_TO_FORMAT",()=>H,"ENABLE_SLASH_MENU_COMMAND",()=>I,"EditorConfigProvider",()=>J,"FieldsDrawer",()=>K,"FixedToolbarFeatureClient",()=>L,"HeadingFeatureClient",()=>M,"HorizontalRuleFeatureClient",()=>N,"HorizontalRuleNode",()=>O,"INSERT_BLOCK_COMMAND",()=>P,"INSERT_INLINE_BLOCK_COMMAND",()=>Q,"IS_ALL_FORMATTING",()=>R,"IndentFeatureClient",()=>S,"InlineBlockContainer",()=>T,"InlineBlockEditButton",()=>U,"InlineBlockLabel",()=>V,"InlineBlockNode",()=>W,"InlineBlockRemoveButton",()=>X,"InlineCodeFeatureClient",()=>Y,"InlineToolbarFeatureClient",()=>Z,"ItalicFeatureClient",()=>$,"LTR_REGEX",()=>_,"LexicalPluginToLexicalFeatureClient",()=>aa,"LinkFeatureClient",()=>ab,"LinkNode",()=>ac,"NON_BREAKING_SPACE",()=>ad,"NodeFormat",()=>ae,"OrderedListFeatureClient",()=>af,"ParagraphFeatureClient",()=>ag,"Point",()=>ah,"RTL_REGEX",()=>ai,"Rect",()=>aj,"RelationshipFeatureClient",()=>ak,"RelationshipNode",()=>al,"RenderLexical",()=>am,"RichTextField",()=>an,"RichTextViewProvider",()=>ao,"SlateToLexicalFeatureClient",()=>ap,"StrikethroughFeatureClient",()=>aq,"SubscriptFeatureClient",()=>ar,"SuperscriptFeatureClient",()=>as,"TEXT_MODE_TO_TYPE",()=>at,"TEXT_TYPE_TO_FORMAT",()=>au,"TEXT_TYPE_TO_MODE",()=>av,"TOGGLE_LINK_COMMAND",()=>aw,"TableFeatureClient",()=>ax,"TestRecorderFeatureClient",()=>ay,"TextStateFeatureClient",()=>az,"ToolbarButton",()=>aA,"ToolbarDropdown",()=>aB,"TreeViewFeatureClient",()=>aC,"UnderlineFeatureClient",()=>aD,"UnorderedListFeatureClient",()=>aE,"UploadFeatureClient",()=>aF,"UploadNode",()=>aG,"addSwipeDownListener",()=>aH,"addSwipeLeftListener",()=>aI,"addSwipeRightListener",()=>aJ,"addSwipeUpListener",()=>aK,"buildDefaultEditorState",()=>aL,"buildEditorState",()=>aM,"codeConverterClient",()=>aN,"createBlockNode",()=>aO,"createClientFeature",()=>aP,"defaultColors",()=>aQ,"defaultEditorLexicalConfig",()=>aR,"getDOMRangeRect",()=>aS,"getEnabledNodes",()=>aT,"getRestPopulateFn",()=>aU,"getSelectedNode",()=>aV,"isHTMLElement",()=>aW,"isPoint",()=>aX,"joinClasses",()=>aY,"sanitizeClientEditorConfig",()=>aZ,"sanitizeClientFeatures",()=>a$,"setFloatingElemPosition",()=>a_,"setFloatingElemPositionForLinkEditor",()=>a0,"slashMenuBasicGroupWithItems",()=>a1,"toolbarAddDropdownGroupWithItems",()=>a2,"toolbarFeatureButtonsGroupWithItems",()=>a3,"toolbarFormatGroupWithItems",()=>a4,"toolbarTextDropdownGroupWithItems",()=>a5,"useBlockComponentContext",()=>a6,"useEditorConfigContext",()=>a7,"useInlineBlockComponentContext",()=>a8,"useLexicalDocumentDrawer",()=>a9,"useLexicalDrawer",()=>ba,"useLexicalListDrawer",()=>bb,"useRichTextView",()=>bc]);var b=a.i(211857);let c=(0,b.registerClientReference)(function(){throw Error("Attempted to call $createAutoLinkNode() from the server but $createAutoLinkNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$createAutoLinkNode"),d=(0,b.registerClientReference)(function(){throw Error("Attempted to call $createBlockNode() from the server but $createBlockNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$createBlockNode"),e=(0,b.registerClientReference)(function(){throw Error("Attempted to call $createHorizontalRuleNode() from the server but $createHorizontalRuleNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$createHorizontalRuleNode"),f=(0,b.registerClientReference)(function(){throw Error("Attempted to call $createInlineBlockNode() from the server but $createInlineBlockNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$createInlineBlockNode"),g=(0,b.registerClientReference)(function(){throw Error("Attempted to call $createLinkNode() from the server but $createLinkNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$createLinkNode"),h=(0,b.registerClientReference)(function(){throw Error("Attempted to call $createRelationshipNode() from the server but $createRelationshipNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$createRelationshipNode"),i=(0,b.registerClientReference)(function(){throw Error("Attempted to call $createUploadNode() from the server but $createUploadNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$createUploadNode"),j=(0,b.registerClientReference)(function(){throw Error("Attempted to call $isAutoLinkNode() from the server but $isAutoLinkNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$isAutoLinkNode"),k=(0,b.registerClientReference)(function(){throw Error("Attempted to call $isBlockNode() from the server but $isBlockNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$isBlockNode"),l=(0,b.registerClientReference)(function(){throw Error("Attempted to call $isHorizontalRuleNode() from the server but $isHorizontalRuleNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$isHorizontalRuleNode"),m=(0,b.registerClientReference)(function(){throw Error("Attempted to call $isInlineBlockNode() from the server but $isInlineBlockNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$isInlineBlockNode"),n=(0,b.registerClientReference)(function(){throw Error("Attempted to call $isLinkNode() from the server but $isLinkNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$isLinkNode"),o=(0,b.registerClientReference)(function(){throw Error("Attempted to call $isRelationshipNode() from the server but $isRelationshipNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$isRelationshipNode"),p=(0,b.registerClientReference)(function(){throw Error("Attempted to call $isUploadNode() from the server but $isUploadNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","$isUploadNode"),q=(0,b.registerClientReference)(function(){throw Error("Attempted to call AlignFeatureClient() from the server but AlignFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","AlignFeatureClient"),r=(0,b.registerClientReference)(function(){throw Error("Attempted to call AutoLinkNode() from the server but AutoLinkNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","AutoLinkNode"),s=(0,b.registerClientReference)(function(){throw Error("Attempted to call BlockCollapsible() from the server but BlockCollapsible is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","BlockCollapsible"),t=(0,b.registerClientReference)(function(){throw Error("Attempted to call BlockEditButton() from the server but BlockEditButton is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","BlockEditButton"),u=(0,b.registerClientReference)(function(){throw Error("Attempted to call BlockNode() from the server but BlockNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","BlockNode"),v=(0,b.registerClientReference)(function(){throw Error("Attempted to call BlockRemoveButton() from the server but BlockRemoveButton is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","BlockRemoveButton"),w=(0,b.registerClientReference)(function(){throw Error("Attempted to call BlockquoteFeatureClient() from the server but BlockquoteFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","BlockquoteFeatureClient"),x=(0,b.registerClientReference)(function(){throw Error("Attempted to call BlocksFeatureClient() from the server but BlocksFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","BlocksFeatureClient"),y=(0,b.registerClientReference)(function(){throw Error("Attempted to call BoldFeatureClient() from the server but BoldFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","BoldFeatureClient"),z=(0,b.registerClientReference)(function(){throw Error("Attempted to call CAN_USE_DOM() from the server but CAN_USE_DOM is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","CAN_USE_DOM"),A=(0,b.registerClientReference)(function(){throw Error("Attempted to call ChecklistFeatureClient() from the server but ChecklistFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","ChecklistFeatureClient"),B=(0,b.registerClientReference)(function(){throw Error("Attempted to call CodeBlockBlockComponent() from the server but CodeBlockBlockComponent is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","CodeBlockBlockComponent"),C=(0,b.registerClientReference)(function(){throw Error("Attempted to call CodeComponent() from the server but CodeComponent is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","CodeComponent"),D=(0,b.registerClientReference)(function(){throw Error("Attempted to call DETAIL_TYPE_TO_DETAIL() from the server but DETAIL_TYPE_TO_DETAIL is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","DETAIL_TYPE_TO_DETAIL"),E=(0,b.registerClientReference)(function(){throw Error("Attempted to call DOUBLE_LINE_BREAK() from the server but DOUBLE_LINE_BREAK is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","DOUBLE_LINE_BREAK"),F=(0,b.registerClientReference)(function(){throw Error("Attempted to call DebugJsxConverterFeatureClient() from the server but DebugJsxConverterFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","DebugJsxConverterFeatureClient"),G=(0,b.registerClientReference)(function(){throw Error("Attempted to call ELEMENT_FORMAT_TO_TYPE() from the server but ELEMENT_FORMAT_TO_TYPE is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","ELEMENT_FORMAT_TO_TYPE"),H=(0,b.registerClientReference)(function(){throw Error("Attempted to call ELEMENT_TYPE_TO_FORMAT() from the server but ELEMENT_TYPE_TO_FORMAT is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","ELEMENT_TYPE_TO_FORMAT"),I=(0,b.registerClientReference)(function(){throw Error("Attempted to call ENABLE_SLASH_MENU_COMMAND() from the server but ENABLE_SLASH_MENU_COMMAND is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","ENABLE_SLASH_MENU_COMMAND"),J=(0,b.registerClientReference)(function(){throw Error("Attempted to call EditorConfigProvider() from the server but EditorConfigProvider is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","EditorConfigProvider"),K=(0,b.registerClientReference)(function(){throw Error("Attempted to call FieldsDrawer() from the server but FieldsDrawer is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","FieldsDrawer"),L=(0,b.registerClientReference)(function(){throw Error("Attempted to call FixedToolbarFeatureClient() from the server but FixedToolbarFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","FixedToolbarFeatureClient"),M=(0,b.registerClientReference)(function(){throw Error("Attempted to call HeadingFeatureClient() from the server but HeadingFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","HeadingFeatureClient"),N=(0,b.registerClientReference)(function(){throw Error("Attempted to call HorizontalRuleFeatureClient() from the server but HorizontalRuleFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","HorizontalRuleFeatureClient"),O=(0,b.registerClientReference)(function(){throw Error("Attempted to call HorizontalRuleNode() from the server but HorizontalRuleNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","HorizontalRuleNode"),P=(0,b.registerClientReference)(function(){throw Error("Attempted to call INSERT_BLOCK_COMMAND() from the server but INSERT_BLOCK_COMMAND is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","INSERT_BLOCK_COMMAND"),Q=(0,b.registerClientReference)(function(){throw Error("Attempted to call INSERT_INLINE_BLOCK_COMMAND() from the server but INSERT_INLINE_BLOCK_COMMAND is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","INSERT_INLINE_BLOCK_COMMAND"),R=(0,b.registerClientReference)(function(){throw Error("Attempted to call IS_ALL_FORMATTING() from the server but IS_ALL_FORMATTING is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","IS_ALL_FORMATTING"),S=(0,b.registerClientReference)(function(){throw Error("Attempted to call IndentFeatureClient() from the server but IndentFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","IndentFeatureClient"),T=(0,b.registerClientReference)(function(){throw Error("Attempted to call InlineBlockContainer() from the server but InlineBlockContainer is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","InlineBlockContainer"),U=(0,b.registerClientReference)(function(){throw Error("Attempted to call InlineBlockEditButton() from the server but InlineBlockEditButton is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","InlineBlockEditButton"),V=(0,b.registerClientReference)(function(){throw Error("Attempted to call InlineBlockLabel() from the server but InlineBlockLabel is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","InlineBlockLabel"),W=(0,b.registerClientReference)(function(){throw Error("Attempted to call InlineBlockNode() from the server but InlineBlockNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","InlineBlockNode"),X=(0,b.registerClientReference)(function(){throw Error("Attempted to call InlineBlockRemoveButton() from the server but InlineBlockRemoveButton is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","InlineBlockRemoveButton"),Y=(0,b.registerClientReference)(function(){throw Error("Attempted to call InlineCodeFeatureClient() from the server but InlineCodeFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","InlineCodeFeatureClient"),Z=(0,b.registerClientReference)(function(){throw Error("Attempted to call InlineToolbarFeatureClient() from the server but InlineToolbarFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","InlineToolbarFeatureClient"),$=(0,b.registerClientReference)(function(){throw Error("Attempted to call ItalicFeatureClient() from the server but ItalicFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","ItalicFeatureClient"),_=(0,b.registerClientReference)(function(){throw Error("Attempted to call LTR_REGEX() from the server but LTR_REGEX is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","LTR_REGEX"),aa=(0,b.registerClientReference)(function(){throw Error("Attempted to call LexicalPluginToLexicalFeatureClient() from the server but LexicalPluginToLexicalFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","LexicalPluginToLexicalFeatureClient"),ab=(0,b.registerClientReference)(function(){throw Error("Attempted to call LinkFeatureClient() from the server but LinkFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","LinkFeatureClient"),ac=(0,b.registerClientReference)(function(){throw Error("Attempted to call LinkNode() from the server but LinkNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","LinkNode"),ad=(0,b.registerClientReference)(function(){throw Error("Attempted to call NON_BREAKING_SPACE() from the server but NON_BREAKING_SPACE is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","NON_BREAKING_SPACE"),ae=(0,b.registerClientReference)(function(){throw Error("Attempted to call NodeFormat() from the server but NodeFormat is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","NodeFormat"),af=(0,b.registerClientReference)(function(){throw Error("Attempted to call OrderedListFeatureClient() from the server but OrderedListFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","OrderedListFeatureClient"),ag=(0,b.registerClientReference)(function(){throw Error("Attempted to call ParagraphFeatureClient() from the server but ParagraphFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","ParagraphFeatureClient"),ah=(0,b.registerClientReference)(function(){throw Error("Attempted to call Point() from the server but Point is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","Point"),ai=(0,b.registerClientReference)(function(){throw Error("Attempted to call RTL_REGEX() from the server but RTL_REGEX is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","RTL_REGEX"),aj=(0,b.registerClientReference)(function(){throw Error("Attempted to call Rect() from the server but Rect is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","Rect"),ak=(0,b.registerClientReference)(function(){throw Error("Attempted to call RelationshipFeatureClient() from the server but RelationshipFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","RelationshipFeatureClient"),al=(0,b.registerClientReference)(function(){throw Error("Attempted to call RelationshipNode() from the server but RelationshipNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","RelationshipNode"),am=(0,b.registerClientReference)(function(){throw Error("Attempted to call RenderLexical() from the server but RenderLexical is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","RenderLexical"),an=(0,b.registerClientReference)(function(){throw Error("Attempted to call RichTextField() from the server but RichTextField is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","RichTextField"),ao=(0,b.registerClientReference)(function(){throw Error("Attempted to call RichTextViewProvider() from the server but RichTextViewProvider is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","RichTextViewProvider"),ap=(0,b.registerClientReference)(function(){throw Error("Attempted to call SlateToLexicalFeatureClient() from the server but SlateToLexicalFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","SlateToLexicalFeatureClient"),aq=(0,b.registerClientReference)(function(){throw Error("Attempted to call StrikethroughFeatureClient() from the server but StrikethroughFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","StrikethroughFeatureClient"),ar=(0,b.registerClientReference)(function(){throw Error("Attempted to call SubscriptFeatureClient() from the server but SubscriptFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","SubscriptFeatureClient"),as=(0,b.registerClientReference)(function(){throw Error("Attempted to call SuperscriptFeatureClient() from the server but SuperscriptFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","SuperscriptFeatureClient"),at=(0,b.registerClientReference)(function(){throw Error("Attempted to call TEXT_MODE_TO_TYPE() from the server but TEXT_MODE_TO_TYPE is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","TEXT_MODE_TO_TYPE"),au=(0,b.registerClientReference)(function(){throw Error("Attempted to call TEXT_TYPE_TO_FORMAT() from the server but TEXT_TYPE_TO_FORMAT is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","TEXT_TYPE_TO_FORMAT"),av=(0,b.registerClientReference)(function(){throw Error("Attempted to call TEXT_TYPE_TO_MODE() from the server but TEXT_TYPE_TO_MODE is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","TEXT_TYPE_TO_MODE"),aw=(0,b.registerClientReference)(function(){throw Error("Attempted to call TOGGLE_LINK_COMMAND() from the server but TOGGLE_LINK_COMMAND is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","TOGGLE_LINK_COMMAND"),ax=(0,b.registerClientReference)(function(){throw Error("Attempted to call TableFeatureClient() from the server but TableFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","TableFeatureClient"),ay=(0,b.registerClientReference)(function(){throw Error("Attempted to call TestRecorderFeatureClient() from the server but TestRecorderFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","TestRecorderFeatureClient"),az=(0,b.registerClientReference)(function(){throw Error("Attempted to call TextStateFeatureClient() from the server but TextStateFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","TextStateFeatureClient"),aA=(0,b.registerClientReference)(function(){throw Error("Attempted to call ToolbarButton() from the server but ToolbarButton is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","ToolbarButton"),aB=(0,b.registerClientReference)(function(){throw Error("Attempted to call ToolbarDropdown() from the server but ToolbarDropdown is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","ToolbarDropdown"),aC=(0,b.registerClientReference)(function(){throw Error("Attempted to call TreeViewFeatureClient() from the server but TreeViewFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","TreeViewFeatureClient"),aD=(0,b.registerClientReference)(function(){throw Error("Attempted to call UnderlineFeatureClient() from the server but UnderlineFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","UnderlineFeatureClient"),aE=(0,b.registerClientReference)(function(){throw Error("Attempted to call UnorderedListFeatureClient() from the server but UnorderedListFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","UnorderedListFeatureClient"),aF=(0,b.registerClientReference)(function(){throw Error("Attempted to call UploadFeatureClient() from the server but UploadFeatureClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","UploadFeatureClient"),aG=(0,b.registerClientReference)(function(){throw Error("Attempted to call UploadNode() from the server but UploadNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","UploadNode"),aH=(0,b.registerClientReference)(function(){throw Error("Attempted to call addSwipeDownListener() from the server but addSwipeDownListener is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","addSwipeDownListener"),aI=(0,b.registerClientReference)(function(){throw Error("Attempted to call addSwipeLeftListener() from the server but addSwipeLeftListener is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","addSwipeLeftListener"),aJ=(0,b.registerClientReference)(function(){throw Error("Attempted to call addSwipeRightListener() from the server but addSwipeRightListener is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","addSwipeRightListener"),aK=(0,b.registerClientReference)(function(){throw Error("Attempted to call addSwipeUpListener() from the server but addSwipeUpListener is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","addSwipeUpListener"),aL=(0,b.registerClientReference)(function(){throw Error("Attempted to call buildDefaultEditorState() from the server but buildDefaultEditorState is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","buildDefaultEditorState"),aM=(0,b.registerClientReference)(function(){throw Error("Attempted to call buildEditorState() from the server but buildEditorState is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","buildEditorState"),aN=(0,b.registerClientReference)(function(){throw Error("Attempted to call codeConverterClient() from the server but codeConverterClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","codeConverterClient"),aO=(0,b.registerClientReference)(function(){throw Error("Attempted to call createBlockNode() from the server but createBlockNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","createBlockNode"),aP=(0,b.registerClientReference)(function(){throw Error("Attempted to call createClientFeature() from the server but createClientFeature is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","createClientFeature"),aQ=(0,b.registerClientReference)(function(){throw Error("Attempted to call defaultColors() from the server but defaultColors is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","defaultColors"),aR=(0,b.registerClientReference)(function(){throw Error("Attempted to call defaultEditorLexicalConfig() from the server but defaultEditorLexicalConfig is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","defaultEditorLexicalConfig"),aS=(0,b.registerClientReference)(function(){throw Error("Attempted to call getDOMRangeRect() from the server but getDOMRangeRect is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","getDOMRangeRect"),aT=(0,b.registerClientReference)(function(){throw Error("Attempted to call getEnabledNodes() from the server but getEnabledNodes is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","getEnabledNodes"),aU=(0,b.registerClientReference)(function(){throw Error("Attempted to call getRestPopulateFn() from the server but getRestPopulateFn is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","getRestPopulateFn"),aV=(0,b.registerClientReference)(function(){throw Error("Attempted to call getSelectedNode() from the server but getSelectedNode is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","getSelectedNode"),aW=(0,b.registerClientReference)(function(){throw Error("Attempted to call isHTMLElement() from the server but isHTMLElement is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","isHTMLElement"),aX=(0,b.registerClientReference)(function(){throw Error("Attempted to call isPoint() from the server but isPoint is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","isPoint"),aY=(0,b.registerClientReference)(function(){throw Error("Attempted to call joinClasses() from the server but joinClasses is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","joinClasses"),aZ=(0,b.registerClientReference)(function(){throw Error("Attempted to call sanitizeClientEditorConfig() from the server but sanitizeClientEditorConfig is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","sanitizeClientEditorConfig"),a$=(0,b.registerClientReference)(function(){throw Error("Attempted to call sanitizeClientFeatures() from the server but sanitizeClientFeatures is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","sanitizeClientFeatures"),a_=(0,b.registerClientReference)(function(){throw Error("Attempted to call setFloatingElemPosition() from the server but setFloatingElemPosition is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","setFloatingElemPosition"),a0=(0,b.registerClientReference)(function(){throw Error("Attempted to call setFloatingElemPositionForLinkEditor() from the server but setFloatingElemPositionForLinkEditor is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","setFloatingElemPositionForLinkEditor"),a1=(0,b.registerClientReference)(function(){throw Error("Attempted to call slashMenuBasicGroupWithItems() from the server but slashMenuBasicGroupWithItems is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","slashMenuBasicGroupWithItems"),a2=(0,b.registerClientReference)(function(){throw Error("Attempted to call toolbarAddDropdownGroupWithItems() from the server but toolbarAddDropdownGroupWithItems is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","toolbarAddDropdownGroupWithItems"),a3=(0,b.registerClientReference)(function(){throw Error("Attempted to call toolbarFeatureButtonsGroupWithItems() from the server but toolbarFeatureButtonsGroupWithItems is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","toolbarFeatureButtonsGroupWithItems"),a4=(0,b.registerClientReference)(function(){throw Error("Attempted to call toolbarFormatGroupWithItems() from the server but toolbarFormatGroupWithItems is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","toolbarFormatGroupWithItems"),a5=(0,b.registerClientReference)(function(){throw Error("Attempted to call toolbarTextDropdownGroupWithItems() from the server but toolbarTextDropdownGroupWithItems is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","toolbarTextDropdownGroupWithItems"),a6=(0,b.registerClientReference)(function(){throw Error("Attempted to call useBlockComponentContext() from the server but useBlockComponentContext is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","useBlockComponentContext"),a7=(0,b.registerClientReference)(function(){throw Error("Attempted to call useEditorConfigContext() from the server but useEditorConfigContext is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","useEditorConfigContext"),a8=(0,b.registerClientReference)(function(){throw Error("Attempted to call useInlineBlockComponentContext() from the server but useInlineBlockComponentContext is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","useInlineBlockComponentContext"),a9=(0,b.registerClientReference)(function(){throw Error("Attempted to call useLexicalDocumentDrawer() from the server but useLexicalDocumentDrawer is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","useLexicalDocumentDrawer"),ba=(0,b.registerClientReference)(function(){throw Error("Attempted to call useLexicalDrawer() from the server but useLexicalDrawer is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","useLexicalDrawer"),bb=(0,b.registerClientReference)(function(){throw Error("Attempted to call useLexicalListDrawer() from the server but useLexicalListDrawer is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","useLexicalListDrawer"),bc=(0,b.registerClientReference)(function(){throw Error("Attempted to call useRichTextView() from the server but useRichTextView is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/richtext-lexical/dist/exports/client/index.js","useRichTextView")},278667,a=>{"use strict";var b=a.i(562039);a.n(b)},56507,a=>{a.v("/_next/static/media/payload-favicon-dark.0kmli3k-gdxnc.png"+(globalThis.NEXT_CLIENT_ASSET_SUFFIX||""))},326351,a=>{a.v("/_next/static/media/payload-favicon-light.1cq1ouprfvl1v.png"+(globalThis.NEXT_CLIENT_ASSET_SUFFIX||""))},216235,a=>{a.v("/_next/static/media/static-og-image.3fxfdojg1cb_w.png"+(globalThis.NEXT_CLIENT_ASSET_SUFFIX||""))},626300,a=>{"use strict";a.s(["Button",()=>c,"ButtonContents",()=>d]);var b=a.i(211857);let c=(0,b.registerClientReference)(function(){throw Error("Attempted to call Button() from the server but Button is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/ui/dist/elements/Button/index.js","Button"),d=(0,b.registerClientReference)(function(){throw Error("Attempted to call ButtonContents() from the server but ButtonContents is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/ui/dist/elements/Button/index.js","ButtonContents")},157929,a=>{"use strict";var b=a.i(626300);a.n(b)},678605,a=>{"use strict";a.s(["Card",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Card() from the server but Card is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/ui/dist/elements/Card/index.js","Card")},661253,a=>{"use strict";var b=a.i(678605);a.n(b)},609188,228100,266688,a=>{"use strict";var b=a.i(907997),c=a.i(851177);a.i(800717);let d=({children:a})=>(0,b.jsx)("div",{className:"field-diff-label",children:a}),e="field-diff";a.s(["FieldDiffContainer",0,a=>{let{className:f,From:g,i18n:h,label:{label:i,locale:j},nestingLevel:k=0,To:l}=a;return(0,b.jsxs)("div",{className:`${e}-container${f?` ${f}`:""} nested-level-${k}`,style:k?{"--left-offset":`calc(50%  - (${k} * calc( calc(var(--base)* 0.5) - 2.5px  )))`}:{"--left-offset":"50%"},children:[(0,b.jsxs)(d,{children:[j&&(0,b.jsx)("span",{className:`${e}__locale-label`,children:j}),"function"!=typeof i&&(0,c.getTranslation)(i||"",h)]}),(0,b.jsxs)("div",{className:`${e}-content`,style:k?{gridTemplateColumns:"calc(var(--left-offset) - calc(var(--base)*0.5) )     calc(50% - calc(var(--base)*0.5) + calc(50% - var(--left-offset)))"}:void 0,children:[g,l]})]})}],609188);let f=/^<(?<name>[^\s/>]+)[^>]*>$/,g=/^<(?<isEnd>\/)?(?<name>[^\s>]+)[^>]*>$/,h=/^<[^>]+>/,i=/^<img[^>]*>$/,j=/^<video[^>]*>.*?<\/video>$/ms;class k{config;leastCommonLength=1/0;matchedBlockList=[];newTokens=[];oldTokens=[];operationList=[];sideBySideContents;unifiedContent;constructor(a,b,{classNames:c={createBlock:"html-diff-create-block-wrapper",createInline:"html-diff-create-inline-wrapper",deleteBlock:"html-diff-delete-block-wrapper",deleteInline:"html-diff-delete-inline-wrapper"},greedyBoundary:d=1e3,greedyMatch:e=!0,minMatchedSize:f=2,tokenizeByCharacter:g=!1}={}){if(this.config={classNames:{createBlock:"html-diff-create-block-wrapper",createInline:"html-diff-create-inline-wrapper",deleteBlock:"html-diff-delete-block-wrapper",deleteInline:"html-diff-delete-inline-wrapper",...c},greedyBoundary:d,greedyMatch:e,minMatchedSize:f},(a=a.trim())===(b=b.trim())){this.unifiedContent=a;let b=0;const c=a.replace(/<([^\s/>]+)[^>]*>/g,(a,c)=>{let d=c.length+1;return`${a.slice(0,d)} data-seq="${++b}"${a.slice(d)}`});this.sideBySideContents=[c,c];return}const h=g?this.tokenizeByCharacter:this.tokenizeByWord;this.oldTokens=h(a),this.newTokens=h(b),this.matchedBlockList=this.getMatchedBlockList(),this.operationList=this.getOperationList()}computeBestMatchedBlock(a,b,c,d){let e=null;for(let f=a;f<b;f++){let a=Math.min(b-f,d-c),g=this.slideBestMatchedBlock(f,c,a);if(g&&(!e||g.size>e.size)&&(e=g,g.size>this.leastCommonLength))return e}for(let f=c;f<d;f++){let c=Math.min(b-a,d-f),g=this.slideBestMatchedBlock(a,f,c);if(g&&(!e||g.size>e.size)&&(e=g,g.size>this.leastCommonLength))break}return e}computeMatchedBlockList(a,b,c,d,e=[]){let f=this.computeBestMatchedBlock(a,b,c,d);return f?(a<f.oldStart&&c<f.newStart&&this.computeMatchedBlockList(a,f.oldStart,c,f.newStart,e),e.push(f),b>f.oldEnd&&d>f.newEnd&&this.computeMatchedBlockList(f.oldEnd,b,f.newEnd,d,e),e):[]}dressUpBlockTag(a,b){return"create"===a?`<div class="${this.config.classNames.createBlock}">${b}</div>`:"delete"===a?`<div class="${this.config.classNames.deleteBlock}">${b}</div>`:""}dressUpDiffContent(a,b){let c=b.length;if(!c)return"";let d="",e=0,f=-1;for(let c of b){f++;let g=c.includes('data-enable-match="true"'),i=c.includes('data-enable-match="false"'),k=!!c.match(h)?.length;i?(e=f+1,d+=c):!g&&k?(f>e&&(d+=this.dressUpText(a,b.slice(e,f))),e=f+1,c.match(j)?d+=this.dressUpBlockTag(a,c):d+=c):g&&k&&(f>e&&(d+=this.dressUpText(a,b.slice(e,f))),e=f+1,d+=this.dressupMatchEnabledHtmlTag(a,c))}return e<c&&(d+=this.dressUpText(a,b.slice(e))),d}dressUpInlineTag(a,b){return"create"===a?`<span class="${this.config.classNames.createInline}">${b}</span>`:"delete"===a?`<span class="${this.config.classNames.deleteInline}">${b}</span>`:""}dressupMatchEnabledHtmlTag(a,b){let c=b.match(f)?.groups?.name;if(!c)return b;let d=c.length+1;return`${b.slice(0,d)} data-match-type="${"create"===a?"create":"delete"}"${b.slice(d,b.length)}`}dressUpText(a,b){let c=b.join("");return c.trim()?"create"===a?`<span data-match-type="create">${c}</span>`:"delete"===a?`<span data-match-type="delete">${c}</span>`:"":""}getMatchedBlockList(){let a=this.oldTokens.length,b=this.newTokens.length,c=null,d=0;for(;d<a&&d<b&&this.oldTokens[d]===this.newTokens[d];)d++;d>=this.config.minMatchedSize&&(c={newEnd:d,newStart:0,oldEnd:d,oldStart:0,size:d});let e=null,f=a-1,g=b-1;for(;d<=f&&d<=g&&this.oldTokens[f]===this.newTokens[g];)f--,g--;let h=a-1-f;h>=this.config.minMatchedSize&&(e={newEnd:b,newStart:g+1,oldEnd:a,oldStart:f+1,size:h});let i=c?d:0,j=e?f+1:a,k=c?d:0,l=e?g+1:b;if(this.config.greedyMatch){let a=Math.min(j-i,l-k);a>this.config.greedyBoundary&&(this.leastCommonLength=Math.floor(a/3))}let m=this.computeMatchedBlockList(i,j,k,l);return c&&m.unshift(c),e&&m.push(e),m}getOperationList(){let a=[],b=0,c=0;for(let d of this.matchedBlockList){let e=b===d.oldStart,f=c===d.newStart,g={newEnd:d.newStart,newStart:c,oldEnd:d.oldStart,oldStart:b};e||f?e&&!f?a.push(Object.assign(g,{type:"create"})):!e&&f&&a.push(Object.assign(g,{type:"delete"})):a.push(Object.assign(g,{type:"replace"})),a.push({type:"equal",newEnd:d.newEnd,newStart:d.newStart,oldEnd:d.oldEnd,oldStart:d.oldStart}),b=d.oldEnd,c=d.newEnd}let d=this.oldTokens.length,e=this.newTokens.length,f={newEnd:e,newStart:c,oldEnd:d,oldStart:b},g=b===d,h=c===e;return g||h?g&&!h?a.push(Object.assign(f,{type:"create"})):!g&&h&&a.push(Object.assign(f,{type:"delete"})):a.push(Object.assign(f,{type:"replace"})),a}slideBestMatchedBlock(a,b,c){let d=0,e=null,f=0;for(let g=0;g<c;g++)this.oldTokens[a+g]===this.newTokens[b+g]?f++:f=0,f>d&&(d=f,e={newEnd:b+g+1,newStart:b+g-f+1,oldEnd:a+g+1,oldStart:a+g-f+1,size:f});return d>=this.config.minMatchedSize?e:null}tokenizeByCharacter(a){let b,c=[],d=0,e=/<picture[^>]*>.*?<\/picture>|<video[^>]*>.*?<\/video>|<[^>]+>/gs;for(;null!==(b=e.exec(a));){let e=a.substring(d,b.index);if(e)for(let a of e)c.push(a);c.push(b[0]),d=b.index+b[0].length}for(let b of a.substring(d))c.push(b);return c}tokenizeByWord(a){return a.match(/<picture[^>]*>.*?<\/picture>|<video[^>]*>.*?<\/video>|<[^>]+>|\w+\b|\s+|[^<>\w]/gs)||[]}getSideBySideContents(){if(void 0!==this.sideBySideContents)return this.sideBySideContents;let a="",b="",c=0;this.operationList.forEach(d=>{switch(d.type){case"create":b+=this.dressUpDiffContent("create",this.newTokens.slice(d.newStart,d.newEnd));break;case"delete":{let b=this.oldTokens.slice(d.oldStart,d.oldEnd);a+=this.dressUpDiffContent("delete",b);break}case"equal":{let e=this.newTokens.slice(d.newStart,d.newEnd),g="";for(let a of e){let b=a.match(f);if(b){c+=1;let d=(b?.groups?.name?.length??0)+1;g+=`${a.slice(0,d)} data-seq="${c}"${a.slice(d)}`}else g+=a}a+=g,b+=g;break}case"replace":a+=this.dressUpDiffContent("delete",this.oldTokens.slice(d.oldStart,d.oldEnd)),b+=this.dressUpDiffContent("create",this.newTokens.slice(d.newStart,d.newEnd));break;default:console.error("Richtext diff error - invalid operation: "+String(d.type))}});let d=[a,b];return this.sideBySideContents=d,d}getUnifiedContent(){if(void 0!==this.unifiedContent)return this.unifiedContent;let a="";return this.operationList.forEach(b=>{switch(b.type){case"create":a+=this.dressUpDiffContent("create",this.newTokens.slice(b.newStart,b.newEnd));break;case"delete":a+=this.dressUpDiffContent("delete",this.oldTokens.slice(b.oldStart,b.oldEnd));break;case"equal":for(let c of this.newTokens.slice(b.newStart,b.newEnd))a+=c;break;case"replace":{let c=this.oldTokens.slice(b.oldStart,b.oldEnd),d=this.newTokens.slice(b.newStart,b.newEnd);if(1===c.length&&1===d.length&&c[0]?.match(h)&&d[0]?.match(h)){a+=d[0];break}let e=[],f=[],k=b.newStart;for(let c=b.oldStart;c<b.oldEnd;c++){let d=this.oldTokens[c];if(!d)continue;let h=d?.match(g);if(h){if([i,j].some(a=>d?.match(a))){e.push(d);continue}a+=this.dressUpDiffContent("delete",e),e.splice(0);let c=!1;for(let d=k;d<b.newEnd;d++){let b=this.newTokens[d];if(!b)continue;let e=b?.match(g);if(e&&e.groups?.name===h.groups?.name&&e.groups?.isEnd===h.groups?.isEnd){c=!0,a+=this.dressUpDiffContent("create",f),a+=b,f.splice(0),k=d+1;break}f.push(b)}c||(a+=d,f.splice(0))}else e.push(d)}k<b.newEnd&&f.push(...this.newTokens.slice(k,b.newEnd)),a+=this.dressUpDiffContent("delete",e),a+=this.dressUpDiffContent("create",f);break}default:console.error("Richtext diff error - invalid operation: "+String(b.type))}}),this.unifiedContent=a,a}}let l="html-diff";a.s(["getHTMLDiffComponents",0,({fromHTML:a,postProcess:c,toHTML:d,tokenizeByCharacter:e})=>{let[f,g]=new k(a,d,{tokenizeByCharacter:e}).getSideBySideContents();return c&&(f=c(f),g=c(g)),{From:f?(0,b.jsx)("div",{className:`${l}__diff-old html-diff`,dangerouslySetInnerHTML:{__html:f}}):null,To:g?(0,b.jsx)("div",{className:`${l}__diff-new html-diff`,dangerouslySetInnerHTML:{__html:g}}):null}}],228100),a.s(["File",0,()=>(0,b.jsxs)("svg",{height:"150",style:{backgroundColor:"#333333"},viewBox:"0 0 150 150",width:"150",xmlns:"http://www.w3.org/2000/svg",children:[(0,b.jsx)("path",{d:"M82.8876 50.5H55.5555V100.5H94.4444V61.9818H82.8876V50.5Z",fill:"white"}),(0,b.jsx)("path",{d:"M82.8876 61.9818H94.4444L82.8876 50.5V61.9818Z",fill:"#9A9A9A"})]})],266688)},59014,a=>{"use strict";a.s(["Locked",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call Locked() from the server but Locked is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/node_modules/@payloadcms/ui/dist/elements/Locked/index.js","Locked")},336473,a=>{"use strict";var b=a.i(59014);a.n(b)},497373,a=>{"use strict";var b=a.i(907997),c=a.i(851177),d=a.i(7156),e=a.i(166274),f=a.i(299463),g=a.i(646096),h=a.i(728309);let i=["Cell","Description","Field","Filter"];a.s(["renderField",0,({id:a,clientFieldSchemaMap:j,collectionSlug:k,data:l,fieldConfig:m,fieldSchemaMap:n,fieldState:o,forceCreateClientField:p,formState:q,indexPath:r,lastRenderedPath:s,mockRSCs:t,operation:u,parentPath:v,parentSchemaPath:w,path:x,permissions:y,preferences:z,readOnly:A,renderAllFields:B,req:C,schemaPath:D,siblingData:E})=>{let F=m.admin?.components&&("beforeInput"in m.admin.components||"afterInput"in m.admin.components),G=B||!s||s!==x||F;if(!G&&"array"!==m.type&&"blocks"!==m.type)return;let H=j&&!p?j.get(D):(0,d.createClientField)({defaultIDType:C.payload.config.db.defaultIDType,field:m,i18n:C.i18n,importMap:C.payload.importMap}),I={field:H,path:x,permissions:y,readOnly:!0===A||("boolean"==typeof y?!y:!y?.[u]),schemaPath:D};o?.customComponents&&(I.customComponents=o.customComponents),["array","blocks","collapsible","group","row","tabs"].includes(m.type)&&(I.indexPath=r,I.parentPath=v,I.parentSchemaPath=w);let J={id:a,clientField:H,clientFieldSchemaMap:j,data:l,field:m,fieldSchemaMap:n,permissions:y,collectionSlug:k,formState:q,i18n:C.i18n,operation:u,payload:C.payload,preferences:z,req:C,siblingData:E,user:C.user,value:"name"in m&&l?.[m.name]};switch(m.type){case"array":o?.rows?.forEach((a,b)=>{let d=a.lastRenderedPath,e=`${x}.${b}`;(B||!d||d!==e)&&(a.lastRenderedPath=e,m.admin?.components&&"RowLabel"in m.admin.components&&(a.customComponents||(a.customComponents={}),a.customComponents.RowLabel=t?"Mock":(0,g.RenderServerComponent)({clientProps:I,Component:m.admin.components.RowLabel,importMap:C.payload.importMap,key:`${b}`,serverProps:{...J,rowLabel:`${(0,c.getTranslation)(m.labels.singular,C.i18n)} ${String(b+1).padStart(2,"0")}`,rowNumber:b+1}})))});break;case"blocks":o?.rows?.forEach((a,b)=>{let d=a.lastRenderedPath,e=`${x}.${b}`;if(!(B||!d||d!==e))return;a.lastRenderedPath=e;let f=a.blockType,h=C.payload.blocks[f]??(m.blockReferences??m.blocks).find(a=>"string"!=typeof a&&a.slug===f);h.admin?.components&&"Label"in h.admin.components&&(o.rows[b]?.customComponents||(o.rows[b].customComponents={}),o.rows[b].customComponents.RowLabel=t?"Mock":(0,g.RenderServerComponent)({clientProps:I,Component:h.admin.components.Label,importMap:C.payload.importMap,key:`${b}`,serverProps:{...J,blockType:a.blockType,rowLabel:`${(0,c.getTranslation)(h.labels.singular,C.i18n)} ${String(b+1).padStart(2,"0")}`,rowNumber:b+1}}))})}if(G&&(o.lastRenderedPath=x,!(0,f.fieldIsHiddenOrDisabled)(H))){switch(m.admin&&(Object.keys(m.admin.components||{}).length>0||"richText"===m.type||"description"in m.admin&&"function"==typeof m.admin.description)&&!o?.customComponents&&(o.customComponents={}),m.type){case"richText":if(!m?.editor)throw new e.MissingEditorProp(m);if("function"==typeof m?.editor)throw Error("Attempted to access unsanitized rich text editor.");m.admin||(m.admin={}),m.admin.components||(m.admin.components={}),o.customComponents.Field=t?"Mock":(0,b.jsx)(h.WatchCondition,{path:x,children:(0,g.RenderServerComponent)({clientProps:I,Component:m.editor.FieldComponent,importMap:C.payload.importMap,serverProps:{...J,sanitizedEditorConfig:"editorConfig"in m.editor?m.editor.editorConfig:void 0}})});break;case"ui":if(m?.admin?.components)for(let a in m.admin.components){if(a in i)continue;let b=m.admin.components[a];o.customComponents[a]=t?"Mock":(0,g.RenderServerComponent)({clientProps:I,Component:b,importMap:C.payload.importMap,key:`field.admin.components.${a}`,serverProps:J})}}m.admin&&("description"in m.admin&&"function"==typeof m.admin?.description&&(o.customComponents.Description=t?"Mock":(0,b.jsx)(h.FieldDescription,{description:m.admin?.description({i18n:C.i18n,t:C.i18n.t}),path:x})),m.admin?.components&&("afterInput"in m.admin.components&&(o.customComponents.AfterInput=t?"Mock":(0,g.RenderServerComponent)({clientProps:I,Component:m.admin.components.afterInput,importMap:C.payload.importMap,key:`field.admin.components.afterInput.${x}`,serverProps:J})),"beforeInput"in m.admin.components&&(o.customComponents.BeforeInput=t?"Mock":(0,g.RenderServerComponent)({clientProps:I,Component:m.admin.components.beforeInput,importMap:C.payload.importMap,key:`field.admin.components.beforeInput.${x}`,serverProps:J})),"Description"in m.admin.components&&(o.customComponents.Description=t?"Mock":(0,g.RenderServerComponent)({clientProps:I,Component:m.admin.components.Description,importMap:C.payload.importMap,key:"field.admin.components.Description",serverProps:J})),"Error"in m.admin.components&&(o.customComponents.Error=t?"Mock":(0,g.RenderServerComponent)({clientProps:I,Component:m.admin.components.Error,importMap:C.payload.importMap,key:"field.admin.components.Error",serverProps:J})),"Label"in m.admin.components&&(o.customComponents.Label=t?"Mock":(0,g.RenderServerComponent)({clientProps:I,Component:m.admin.components.Label,importMap:C.payload.importMap,key:"field.admin.components.Label",serverProps:J})),"Field"in m.admin.components&&(o.customComponents.Field=t?"Mock":(0,b.jsx)(h.WatchCondition,{path:x,children:(0,g.RenderServerComponent)({clientProps:I,Component:m.admin.components.Field,importMap:C.payload.importMap,key:"field.admin.components.Field",serverProps:J})}))))}}])},877113,661861,a=>{"use strict";var b=a.i(800717),c=a.i(7156),d=a.i(299463),e=a.i(118726);let f=({clientSchemaMap:a,config:b,fields:g,i18n:h,parentIndexPath:i,parentSchemaPath:j,payload:k,schemaMap:l})=>{for(let[m,n]of g.entries()){let{indexPath:g,schemaPath:o}=(0,e.getFieldPaths)({field:n,index:m,parentIndexPath:i,parentSchemaPath:j});switch(a.set(o,n),n.type){case"array":f({clientSchemaMap:a,config:b,fields:n.fields,i18n:h,parentIndexPath:"",parentSchemaPath:o,payload:k,schemaMap:l});break;case"blocks":(n.blockReferences??n.blocks).map(c=>{let d="string"==typeof c?b.blocksMap?b.blocksMap[c]:b.blocks.find(a=>"string"!=typeof a&&a.slug===c):c,e=`${o}.${d.slug}`;a.set(e,d),f({clientSchemaMap:a,config:b,fields:d.fields,i18n:h,parentIndexPath:"",parentSchemaPath:o+"."+d.slug,payload:k,schemaMap:l})});break;case"collapsible":case"row":f({clientSchemaMap:a,config:b,fields:n.fields,i18n:h,parentIndexPath:g,parentSchemaPath:o,payload:k,schemaMap:l});break;case"group":(0,d.fieldAffectsData)(n)?f({clientSchemaMap:a,config:b,fields:n.fields,i18n:h,parentIndexPath:"",parentSchemaPath:o,payload:k,schemaMap:l}):f({clientSchemaMap:a,config:b,fields:n.fields,i18n:h,parentIndexPath:g,parentSchemaPath:o,payload:k,schemaMap:l});break;case"richText":{let b=new Map;for(let[a,c]of l.entries())a.startsWith(`${o}.`)&&b.set(a,c);for(let[d,e]of b.entries()){if("slug"in e){let b=(0,c.createClientBlocks)({blocks:[e],defaultIDType:k.config.db.defaultIDType,i18n:h,importMap:k.importMap});a.set(d,b[0]);continue}if("type"in e){let b=(0,c.createClientFields)({defaultIDType:k.config.db.defaultIDType,disableAddingID:!0,fields:[e],i18n:h,importMap:k.importMap});a.set(d,b[0]);continue}if("fields"in e){let b=(0,c.createClientFields)({defaultIDType:k.config.db.defaultIDType,disableAddingID:!0,fields:e.fields,i18n:h,importMap:k.importMap});a.set(d,{fields:b});continue}}break}case"tab":{let c=(0,d.tabHasName)(n);f({clientSchemaMap:a,config:b,fields:n.fields,i18n:h,parentIndexPath:c?"":g,parentSchemaPath:o,payload:k,schemaMap:l});break}case"tabs":f({clientSchemaMap:a,config:b,fields:n.tabs.map(a=>({...a,type:"tab"})),i18n:h,parentIndexPath:g,parentSchemaPath:o,payload:k,schemaMap:l})}}},g=[{name:"password",type:"text",required:!0},{name:"confirm-password",type:"text",required:!0}],h=a.g._payload_clientSchemaMap;h||(h=a.g._payload_clientSchemaMap=null);let i=(0,b.cache)(b=>{let{collectionSlug:c,config:d,globalSlug:e,i18n:i,payload:j,schemaMap:k,widgetSlug:l}=b;(!h||a.g._payload_doNotCacheClientSchemaMap)&&(h=new Map);let m=c||e||`widget:${l}`,n=h.get(m);if(n)return n;n=new Map;let{clientFieldSchemaMap:o}=(a=>{let{collectionSlug:b,config:c,globalSlug:d,i18n:e,payload:h,schemaMap:i,widgetSlug:j}=a,k=new Map;if(b){let a=c.collections.find(a=>a.slug===b);if(a){let d=a?.fields||[];a.auth&&!a.auth.disableLocalStrategy&&(g[0].label=e.t("general:password"),g[1].label=e.t("authentication:confirmPassword"),d=d.concat(g)),k.set(b,{fields:d}),f({clientSchemaMap:k,config:c,fields:d,i18n:e,parentIndexPath:"",parentSchemaPath:b,payload:h,schemaMap:i})}}else if(d){let a=c.globals.find(a=>a.slug===d);a&&(k.set(d,{fields:a.fields}),f({clientSchemaMap:k,config:c,fields:a.fields,i18n:e,parentIndexPath:"",parentSchemaPath:d,payload:h,schemaMap:i}))}else if(j){let a=c.admin?.dashboard?.widgets?.find(a=>a.slug===j);a?.fields?.length&&(k.set(j,{fields:a.fields}),f({clientSchemaMap:k,config:c,fields:a.fields,i18n:e,parentIndexPath:"",parentSchemaPath:j,payload:h,schemaMap:i}))}return{clientFieldSchemaMap:k}})({collectionSlug:c,config:d,globalSlug:e,i18n:i,payload:j,schemaMap:k,widgetSlug:l});return h.set(m,o),a.g._payload_clientSchemaMap=h,a.g._payload_doNotCacheClientSchemaMap=!1,o});a.s(["getClientSchemaMap",0,i],877113);var j=a.i(913226),k=a.i(760232);let l=[{name:"password",type:"text",required:!0,validate:j.password},{name:"confirm-password",type:"text",required:!0,validate:j.confirmPassword}],m=a.g._payload_schemaMap;m||(m=a.g._payload_schemaMap=null);let n=(0,b.cache)(b=>{let{collectionSlug:c,config:d,globalSlug:e,i18n:f,widgetSlug:g}=b;(!m||a.g._payload_doNotCacheSchemaMap)&&(m=new Map);let h=c||e||`widget:${g}`,i=m.get(h);if(i)return i;i=new Map;let{fieldSchemaMap:j}=(a=>{let{collectionSlug:b,config:c,globalSlug:d,i18n:e,widgetSlug:f}=a,g=new Map;if(b){let a=c.collections.find(a=>a.slug===b);if(a){let d=a?.fields||[];a.auth&&!a.auth.disableLocalStrategy&&(l[0].label=e.t("general:password"),l[1].label=e.t("authentication:confirmPassword"),d=d.concat(l)),g.set(b,{fields:d}),(0,k.traverseFields)({config:c,fields:d,i18n:e,parentIndexPath:"",parentSchemaPath:b,schemaMap:g})}}else if(d){let a=c.globals.find(a=>a.slug===d);a&&(g.set(d,{fields:a.fields}),(0,k.traverseFields)({config:c,fields:a.fields,i18n:e,parentIndexPath:"",parentSchemaPath:d,schemaMap:g}))}else if(f){let a=c.admin?.dashboard?.widgets?.find(a=>a.slug===f),b=a?.fields;b?.length&&(g.set(f,{fields:b}),(0,k.traverseFields)({config:c,fields:b,i18n:e,parentIndexPath:"",parentSchemaPath:f,schemaMap:g}))}return{fieldSchemaMap:g}})({collectionSlug:c,config:d,globalSlug:e,i18n:f,widgetSlug:g});return m.set(h,j),a.g._payload_schemaMap=m,a.g._payload_doNotCacheSchemaMap=!1,j});a.s(["getSchemaMap",0,n],661861)},378393,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0});var d={useDynamicRouteParams:function(){return f.useDynamicRouteParams},useDynamicSearchParams:function(){return f.useDynamicSearchParams}};for(var e in d)Object.defineProperty(c,e,{enumerable:!0,get:d[e]});let f=a.r(660384);("function"==typeof c.default||"object"==typeof c.default&&null!==c.default)&&void 0===c.default.__esModule&&(Object.defineProperty(c.default,"__esModule",{value:!0}),Object.assign(c.default,c),b.exports=c.default)},300541,(a,b,c)=>{"use strict";b.exports=a.r(924951).vendored.contexts.ServerInsertedHtml},190905,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0});var d={UnrecognizedActionError:function(){return f},unstable_isUnrecognizedActionError:function(){return g}};for(var e in d)Object.defineProperty(c,e,{enumerable:!0,get:d[e]});class f extends Error{constructor(...a){super(...a),this.name="UnrecognizedActionError"}}function g(a){return!!(a&&"object"==typeof a&&a instanceof f)}("function"==typeof c.default||"object"==typeof c.default&&null!==c.default)&&void 0===c.default.__esModule&&(Object.defineProperty(c.default,"__esModule",{value:!0}),Object.assign(c.default,c),b.exports=c.default)},234595,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0});var d={ReadonlyURLSearchParams:function(){return h.ReadonlyURLSearchParams},RedirectType:function(){return m.RedirectType},ServerInsertedHTMLContext:function(){return k.ServerInsertedHTMLContext},forbidden:function(){return m.forbidden},notFound:function(){return m.notFound},permanentRedirect:function(){return m.permanentRedirect},redirect:function(){return m.redirect},unauthorized:function(){return m.unauthorized},unstable_isUnrecognizedActionError:function(){return l.unstable_isUnrecognizedActionError},unstable_rethrow:function(){return m.unstable_rethrow},useParams:function(){return t},usePathname:function(){return r},useRouter:function(){return s},useSearchParams:function(){return q},useSelectedLayoutSegment:function(){return v},useSelectedLayoutSegments:function(){return u},useServerInsertedHTML:function(){return k.useServerInsertedHTML}};for(var e in d)Object.defineProperty(c,e,{enumerable:!0,get:d[e]});let f=a.r(164240)._(a.r(800717)),g=a.r(830607),h=a.r(971089),i=a.r(398698),j=a.r(378393),k=a.r(300541),l=a.r(190905),m=a.r(673727),{instrumentParamsForClientValidation:n,instrumentSearchParamsForClientValidation:o,expectCompleteParamsInClientValidation:p}={};function q(){j.useDynamicSearchParams?.("useSearchParams()");let a=(0,f.useContext)(h.SearchParamsContext);return(0,f.useMemo)(()=>a?new h.ReadonlyURLSearchParams(a):null,[a])}function r(){return j.useDynamicRouteParams?.("usePathname()"),(0,f.useContext)(h.PathnameContext)}function s(){let a=(0,f.useContext)(g.AppRouterContext);if(null===a)throw Object.defineProperty(Error("invariant expected app router to be mounted"),"__NEXT_ERROR_CODE",{value:"E238",enumerable:!1,configurable:!0});let b=(0,f.useContext)(g.LayoutRouterContext),c=b?.parentCacheNode.bfcacheId??0;return(0,f.useMemo)(()=>({back:a.back,forward:a.forward,refresh:a.refresh,hmrRefresh:a.hmrRefresh,push:a.push,replace:a.replace,prefetch:a.prefetch,experimental_gesturePush:a.experimental_gesturePush,bfcacheId:"_b_"+c+"_"}),[a,c])}function t(){return j.useDynamicRouteParams?.("useParams()"),(0,f.useContext)(h.PathParamsContext)}function u(a="children"){j.useDynamicRouteParams?.("useSelectedLayoutSegments()");let b=(0,f.useContext)(g.LayoutRouterContext);return b?(0,i.getSelectedLayoutSegmentPath)(b.parentTree,a):null}function v(a="children"){j.useDynamicRouteParams?.("useSelectedLayoutSegment()"),(0,f.useContext)(h.NavigationPromisesContext);let b=u(a);return(0,i.computeSelectedLayoutSegment)(b,a)}("function"==typeof c.default||"object"==typeof c.default&&null!==c.default)&&void 0===c.default.__esModule&&(Object.defineProperty(c.default,"__esModule",{value:!0}),Object.assign(c.default,c),b.exports=c.default)},232550,(a,b,c)=>{b.exports=a.r(234595)},830607,(a,b,c)=>{"use strict";b.exports=a.r(924951).vendored.contexts.AppRouterContext},971089,(a,b,c)=>{"use strict";b.exports=a.r(924951).vendored.contexts.HooksClientContext},370277,a=>{"use strict";var b,c,d=a.i(199087),e=a.i(907997),f=a.i(851177),g=a.i(728309),h=a.i(911082),i=a.i(800717),j=a.i(497373),k=a.i(223585),l=a.i(278667),m=a.i(527336);async function n({context:a,initialState:b,nodeData:c}){let d=b??{};for(let b of c)if("children"in b&&(d=await n({context:a,initialState:d,nodeData:b.children})),"block"===b.type||"inlineBlock"===b.type){let c=b?.fields?.id;if(!c)continue;let e="block"===b.type?`${a.lexicalFieldSchemaPath}.lexical_internal_feature.blocks.lexical_blocks.${b.fields.blockType}.fields`:`${a.lexicalFieldSchemaPath}.lexical_internal_feature.blocks.lexical_inline_blocks.${b.fields.blockType}.fields`,f=await (0,m.fieldSchemasToFormState)({id:a.id,clientFieldSchemaMap:a.clientFieldSchemaMap,collectionSlug:a.collectionSlug,data:b.fields,documentData:a.documentData,fields:a.fieldSchemaMap.get(e)?.fields,fieldSchemaMap:a.fieldSchemaMap,initialBlockData:b.fields,operation:a.operation,permissions:!0,preferences:a.preferences,readOnly:a.disabled,renderAllFields:!0,renderFieldFn:a.renderFieldFn,req:a.req,schemaPath:e});if(d[c]||(d[c]={}),d[c].formState=f,"block"===b.type){let b=a.preferences?.fields?.[a.field.name],e=b?.collapsed;Array.isArray(e)&&e.includes(c)&&(d[c].collapsed=!0)}}return d}let o=async a=>{let b=a.field,c=a.path??a.clientField.name,d=a.schemaPath??c,g=a?.readOnly||b?.admin?.readOnly;if(!a?.clientField?.name)throw Error("Initialized lexical RSC field without a field name");let{clientFeatures:h,featureClientImportMap:i,featureClientSchemaMap:m}=function(a){let b={},c=[...a.sanitizedEditorConfig.resolvedFeatureMap].sort((a,b)=>a[1].order-b[1].order),d={},e={};for(let[f,g]of c){b[f]={};let c=g.ClientFeature;if(c){let d=(0,k.getFromImportMap)({importMap:a.payload.importMap,PayloadComponent:c,schemaPath:"lexical-clientComponent",silent:!0});if(!d)continue;let e=g.clientFeatureProps??{};e.featureKey=g.key,e.order=g.order,"object"==typeof c&&c.clientProps&&(e.clientProps=c.clientProps),b[f]={clientFeatureProps:e,clientFeatureProvider:d}}if(g.generateSchemaMap){let b=`${a.schemaPath}.lexical_internal_feature.${f}`;for(let[c,e]of(d[f]={},a.clientFieldSchemaMap.entries()))c.startsWith(b)&&(d[f][c]="fields"in e?e.fields:[e])}if(g.componentImports&&"object"==typeof g.componentImports&&!Array.isArray(g.componentImports))for(let[b,c]of Object.entries(g.componentImports)){let d=(0,k.getFromImportMap)({importMap:a.payload.importMap,PayloadComponent:c,schemaPath:"lexical-clientComponent",silent:!0});e[`${g.key}.${b}`]=d}}return{clientFeatures:b,featureClientImportMap:e,featureClientSchemaMap:d}}({clientFieldSchemaMap:a.clientFieldSchemaMap,fieldSchemaMap:a.fieldSchemaMap,i18n:a.i18n,path:c,payload:a.payload,sanitizedEditorConfig:a.sanitizedEditorConfig,schemaPath:d}),o={};a.siblingData?.[b.name]?.root?.children?.length&&(o=await n({context:{id:a.id,clientFieldSchemaMap:a.clientFieldSchemaMap,collectionSlug:a.collectionSlug,disabled:g,documentData:a.data,field:b,fieldSchemaMap:a.fieldSchemaMap,lexicalFieldSchemaPath:d,operation:a.operation,permissions:a.permissions,preferences:a.preferences,renderFieldFn:j.renderField,req:a.req},nodeData:a.siblingData?.[b.name]?.root?.children}));let p=a.admin?.placeholder,q=p?(0,f.getTranslation)(p,a.i18n):void 0,r={};q&&(r.placeholder=q),a.admin?.hideGutter&&(r.hideGutter=!0),a.admin?.hideInsertParagraphAtEnd&&(r.hideInsertParagraphAtEnd=!0),a.admin?.hideAddBlockButton&&(r.hideAddBlockButton=!0),a.admin?.hideDraggableBlockElement&&(r.hideDraggableBlockElement=!0);let s={clientFeatures:h,featureClientSchemaMap:m,field:a.clientField,forceRender:a.forceRender,initialLexicalFormState:o,lexicalEditorConfig:a.sanitizedEditorConfig.lexical,path:c,permissions:a.permissions,readOnly:a.readOnly,renderedBlocks:a.renderedBlocks,schemaPath:d};if(a?.views){let b=(0,k.getFromImportMap)({importMap:a.payload.importMap,PayloadComponent:a.views,schemaPath:"lexical-viewMap",silent:!0});b&&(s.views=b)}for(let a in Object.keys(r).length&&(s.admin=r),Object.keys(i).length&&(s.featureClientImportMap=i),s)void 0===s[a]&&delete s[a];return(0,e.jsx)(l.RichTextField,{...s})};var p=a.i(609188),q=a.i(228100),r=a.i(599591);let s=new Set(["h1","h2","h3","h4","h5","h6"]);var t=a.i(600827);function u(a){if(!a)return"";let b=a.trim().replace(/[\x00-\x1f\x7f]/g,"");if(b.startsWith("#")||b.startsWith("/")||b.startsWith("./")||b.startsWith("../"))return b;let c=b.match(/^([a-z][a-z0-9+\-.]*):(?=.)/i);if(c){let a=c[1].toLowerCase();if("http"!==a&&"https"!==a&&"mailto"!==a&&"tel"!==a)return"#"}return b}var v=a.i(772522);let w=new Set(["ol","ul"]),x=new Set(["bullet","check","number"]),y=new Set(["aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentcolor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","green","greenyellow","grey","honeydew","hotpink","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]),z=/^(?:#[0-9a-fA-F]{3,8}|rgba?\([\d,.\s/%]+\)|hsla?\([\d,.\s/%deg]+\))$/,A="֑-߿יִ-﷽ﹰ-ﻼ",B="A-Za-zÀ-ÖØ-öø-ʸ̀-֐ࠀ-῿‎Ⰰ-﬜︀-﹯﻽-￿";RegExp("^[^"+B+"]*["+A+"]"),RegExp("^[^"+A+"]*["+B+"]");let C={paragraph:async({node:a,nodesToHTML:b,providedStyleTag:c})=>{let d=await b({nodes:a.children});return d?.length?`<p${c}>${d.join("")}</p>`:`<p${c}><br /></p>`},text:({node:a})=>{let b=(0,t.default)(a.text);return 1&a.format&&(b=`<strong>${b}</strong>`),2&a.format&&(b=`<em>${b}</em>`),4&a.format&&(b=`<span style="text-decoration: line-through;">${b}</span>`),8&a.format&&(b=`<span style="text-decoration: underline;">${b}</span>`),16&a.format&&(b=`<code>${b}</code>`),32&a.format&&(b=`<sub>${b}</sub>`),64&a.format&&(b=`<sup>${b}</sup>`),b},linebreak:"<br />",quote:async({node:a,nodesToHTML:b,providedStyleTag:c})=>{let d=(await b({nodes:a.children})).join("");return`<blockquote${c}>${d}</blockquote>`},table:async({node:a,nodesToHTML:b,providedStyleTag:c})=>{let d=(await b({nodes:a.children})).join("");return`<div${c} class="lexical-table-container">
        <table class="lexical-table" style="border-collapse: collapse;">
          <tbody>${d}</tbody>
        </table>
      </div>`},tablecell:async({node:a,nodesToHTML:b,providedCSSString:c})=>{let d,e=(await b({nodes:a.children})).join(""),f=a.headerState>0?"th":"td",g=`lexical-table-cell-header-${a.headerState}`,h="border: 1px solid #ccc; padding: 8px;"+c;a.backgroundColor&&(d=a.backgroundColor,z.test(d)||y.has(d.toLowerCase()))&&(h+=` background-color: ${a.backgroundColor};`);let i=a.colSpan&&a.colSpan>1?` colspan="${a.colSpan}"`:"",j=a.rowSpan&&a.rowSpan>1?` rowspan="${a.rowSpan}"`:"";return`<${f}
        class="lexical-table-cell ${g}"
        ${i}
        ${j}
        style="${h}"
      >
        ${e}
      </${f}>
    `},tablerow:async({node:a,nodesToHTML:b,providedStyleTag:c})=>{let d=(await b({nodes:a.children})).join("");return`<tr${c} class="lexical-table-row">
        ${d}
      </tr>`},heading:async({node:a,nodesToHTML:b,providedStyleTag:c})=>{let d=(await b({nodes:a.children})).join(""),e=s.has(a.tag)?a.tag:"h1";return`<${e}${c}>${d}</${e}>`},horizontalrule:"<hr />",list:async({node:a,nodesToHTML:b,providedStyleTag:c})=>{let d=(await b({nodes:a.children})).join(""),e=w.has(a.tag)?a.tag:"ul",f=x.has(a.listType)?a.listType:"bullet";return`<${e}${c} class="list-${f}">${d}</${e}>`},listitem:async({node:a,nodesToHTML:b,parent:c,providedCSSString:d})=>{let e=a.children.some(a=>"list"===a.type),f=(await b({nodes:a.children})).join("");if(!("listType"in c)||c?.listType!=="check")return`<li
          class="${e?"nestedListItem":""}"
          style="${e?`list-style-type: none;${d}`:d}"
          value="${a.value}"
        >${f}</li>`;{let b=(0,v.v4)();return`<li
          aria-checked="${a.checked?"true":"false"}"
          class="list-item-checkbox${a.checked?" list-item-checkbox-checked":" list-item-checkbox-unchecked"}${e?" nestedListItem":""}"
          role="checkbox"
          style="list-style-type: none;${d}"
          tabIndex="-1"
          value="${a.value}"
        >
          ${e?f:`<input${a.checked?" checked":""} id="${b}" readOnly="true" type="checkbox" />
            <label htmlFor="${b}">${f}</label>
            <br />`}
        </li>`}},...(({internalDocToHref:a})=>({autolink:async({node:a,nodesToHTML:b,providedStyleTag:c})=>{let d=(await b({nodes:a.children})).join(""),e=(0,t.default)(u(a.fields.url??""));return`<a${c} href="${e}"${a.fields.newTab?' rel="noopener noreferrer" target="_blank"':""}>${d}</a>`},link:async({node:b,nodesToHTML:c,populate:d,providedStyleTag:e})=>{let f=(await c({nodes:b.children})).join(""),g=b.fields.url??"";"internal"===b.fields.linkType&&(a?g=await a({linkNode:b,populate:d}):(console.error("Lexical => HTML converter: Link converter: found internal link, but internalDocToHref is not provided"),g="#"));let h=(0,t.default)(u(g));return`<a${e} href="${h}"${b.fields.newTab?' rel="noopener noreferrer" target="_blank"':""}>${f}</a>`}}))({}),upload:async({node:a,populate:b,providedStyleTag:c})=>{let d;if("object"!=typeof a.value){if(!b)return"";d=await b({id:a.value,collectionSlug:a.relationTo})}else d=a.value;if(!d)return"";let e=(0,t.default)(a.fields?.alt||d?.alt||""),f=(0,t.default)(d.url??"");if(!d.mimeType.startsWith("image"))return`<a${c} href="${f}" rel="noopener noreferrer">${(0,t.default)(d.filename??"")}</a>`;if(!d.sizes||!Object.keys(d.sizes).length)return`
        <img${c}
          alt="${e}"
          height="${(0,t.default)(String(d.height??""))}"
          src="${f}"
          width="${(0,t.default)(String(d.width??""))}"
        />
      `;let g="";for(let a in d.sizes){let b=d.sizes[a];b&&b.width&&b.height&&b.mimeType&&b.filesize&&b.filename&&b.url&&(g+=`
        <source
          media="(max-width: ${(0,t.default)(String(b.width))}px)"
          srcset="${(0,t.default)(b.url)}"
          type="${(0,t.default)(b.mimeType)}"
        />
      `)}return g+=`
      <img
        alt="${e}"
        height="${(0,t.default)(String(d.height??""))}"
        src="${f}"
        width="${(0,t.default)(String(d.width??""))}"
      />
    `,`<picture${c}>${g}</picture>`},tab:"	"};async function D({className:a,converters:b,data:c,disableContainer:d,disableIndent:e,disableTextAlign:f,populate:g}){if((0,r.hasText)(c)){let h={};h=b?"function"==typeof b?b({defaultConverters:C}):b:C;let i=(await E({converters:h,disableIndent:e,disableTextAlign:f,nodes:c?.root?.children,parent:c?.root,populate:g})).join("");return d?i:`<div class="${a??"payload-richtext"}">${i}</div>`}return d?"":`<div class="${a??"payload-richtext"}"></div>`}async function E({converters:a,disableIndent:b,disableTextAlign:c,nodes:d,parent:e,populate:f}){let g=a.unknown,h=[],i=-1;for(let j of d){i++;let{converterForNode:d,providedCSSString:k,providedStyleTag:l}=function({converters:a,disableIndent:b,disableTextAlign:c,node:d,unknownConverter:e}){let f;"block"===d.type?(f=a?.blocks?.[d?.fields?.blockType])||e||console.error(`Lexical => HTML converter: Blocks converter: found ${d?.fields?.blockType} block, but no converter is provided`):"inlineBlock"===d.type?(f=a?.inlineBlocks?.[d?.fields?.blockType])||e||console.error(`Lexical => HTML converter: Inline Blocks converter: found ${d?.fields?.blockType} inline block, but no converter is provided`):f=a[d.type];let g={};if(!c&&(!Array.isArray(c)||!c?.includes(d.type))&&"format"in d&&d.format)switch(d.format){case"center":g["text-align"]="center";break;case"end":case"right":g["text-align"]="right";break;case"justify":g["text-align"]="justify";break;case"left":break;case"start":g["text-align"]="left"}!b&&(!Array.isArray(b)||!b?.includes(d.type))&&"indent"in d&&d.indent&&"listitem"!==d.type&&(g["padding-inline-start"]=`${40*Number(d.indent)}px`);let h="";for(let a of Object.keys(g))h+=`${a}: ${g[a]};`;let i=h?.length?` style="${h}"`:"";return{converterForNode:f??e,providedCSSString:h,providedStyleTag:i}}({converters:a,disableIndent:b,disableTextAlign:c,node:j,unknownConverter:g});try{let g;g=d?"function"==typeof d?await d({childIndex:i,converters:a,node:j,populate:f,nodesToHTML:async d=>await E({converters:d.converters??a,disableIndent:d.disableIndent??b,disableTextAlign:d.disableTextAlign??c,nodes:d.nodes,parent:d.parent??{...j,parent:e},populate:f}),parent:e,providedCSSString:k,providedStyleTag:l}):d:"<span>unknown node</span>",h.push(g)}catch(a){console.error("Error converting lexical node to HTML:",a,"node:",j),h.push("")}}return h.filter(Boolean)}var F=a.i(78794),G=a.i(550437);let H=async({currentDepth:a,depth:b,draft:c,overrideAccess:d,payload:e,req:f,showHiddenFields:g})=>{let h=f;if(void 0===f&&e&&(h=await (0,F.createLocalReq)({},e)),!h)throw Error("No req or payload provided");return async({id:e,collectionSlug:f,select:i})=>{let j={};return await (0,G.populate)({id:e,collectionSlug:f,currentDepth:a,data:j,depth:b,draft:c??!1,key:"value",overrideAccess:d??!0,req:h,select:i,showHiddenFields:g??!1}),j.value}};var I=a.i(254799);let J=()=>(0,e.jsx)("svg",{className:"icon icon--check",viewBox:"0 0 20 20",xmlns:"http://www.w3.org/2000/svg",children:(0,e.jsx)("path",{className:"stroke",d:"M15.3333 6.00001L8.00001 13.3333L4.66667 10",strokeLinecap:"square"})}),K={listitem:async({node:b,nodesToHTML:c,parent:d,providedCSSString:f})=>{let g=b.children.some(a=>"list"===a.type),h=(await c({nodes:b.children})).join("");if(!("listType"in d)||d?.listType!=="check")return`<li
          class="${g?"nestedListItem":""}"
          style="${g?`list-style-type: none;${f}`:f}"
          value="${b.value}"
          data-enable-match="true"
        >${h}</li>`;{let c=(await a.A(994653)).default,d=(0,e.jsx)("li",{"aria-checked":!!b.checked,className:`checkboxItem ${b.checked?"checkboxItem--checked":"checkboxItem--unchecked"}${g?" checkboxItem--nested":""}`,role:"checkbox",tabIndex:-1,value:b.value,children:g?(0,e.jsx)("div",{dangerouslySetInnerHTML:{__html:h}}):(0,e.jsxs)("div",{className:"checkboxItem__wrapper",children:[(0,e.jsx)("div",{className:"checkboxItem__icon","data-checked":b.checked,"data-enable-match":"true",children:b.checked&&(0,e.jsx)(J,{})}),(0,e.jsx)("span",{className:"checkboxItem__label",children:h})]})}),i=c.renderToStaticMarkup(d),j=i.indexOf('class="list-item-checkbox'),k=i.indexOf('class="list-item-checkbox',j),l=i.indexOf('"',k+6),m=i.substring(k,l),n=`${m} style="list-style-type: none;${f}"`;return i.replace(m,n)}}},L="lexical-relationship-diff",M="lexical-unknown-diff";var N=a.i(266688);let O="lexical-upload-diff",P=async b=>{let{comparisonValue:c,field:d,i18n:g,locale:j,nestingLevel:k,req:l,versionValue:m}=b,n=async({linkNode:a,populate:b})=>{let c;if(!a.fields.doc)return"#";let{relationTo:d,value:e}=a.fields.doc;if("object"==typeof e&&null!==e)c=e.id;else if(b&&"object"!=typeof e){let a=await b({id:e,collectionSlug:d});if(!a||!a.id)return"#";c=a.id}else c=e;return(0,h.formatAdminURL)({adminRoute:l.payload.config.routes.admin,path:`/collections/${d}/${c}`,serverURL:l.payload.config.serverURL})},o=({defaultConverters:b})=>({...b,...(({internalDocToHref:a})=>({autolink:async({node:a,nodesToHTML:b,providedStyleTag:c})=>{let d=(await b({nodes:a.children})).join(""),e=(0,I.createHash)("sha256").update(JSON.stringify(a.fields)).digest("hex"),f=(0,t.default)(u(a.fields.url??""));return`<a${c} data-fields-hash="${e}" data-enable-match="true" href="${f}"${a.fields.newTab?' rel="noopener noreferrer" target="_blank"':""}>
        ${d}
      </a>`},link:async({node:b,nodesToHTML:c,populate:d,providedStyleTag:e})=>{let f=(await c({nodes:b.children})).join(""),g=b.fields.url??"";"internal"===b.fields.linkType&&(a?g=await a({linkNode:b,populate:d}):(console.error("Lexical => HTML converter: Link converter: found internal link, but internalDocToHref is not provided"),g="#"));let h=(0,I.createHash)("sha256").update(JSON.stringify(b.fields??{})).digest("hex"),i=(0,t.default)(u(g));return`<a${e} data-fields-hash="${h}" data-enable-match="true" href="${i}"${b.fields.newTab?' rel="noopener noreferrer" target="_blank"':""}>
        ${f}
      </a>`}}))({internalDocToHref:n}),...K,upload:async({node:b,populate:c,providedCSSString:d})=>{let f;if("object"!=typeof b.value){if(!c)return"";f=await c({id:b.value,collectionSlug:b.relationTo})}else f=b.value;if(!f)return"";let g=b.fields?.alt||f?.alt||"",h="thumbnailURL"in f&&f?.thumbnailURL||f?.url||"",j=(await a.A(994653)).default,k=(0,I.createHash)("sha256").update(JSON.stringify(b.fields??{})).digest("hex"),l=(0,e.jsx)("div",{className:`${O}${d}`,"data-enable-match":"true","data-fields-hash":`${k}`,"data-filename":f?.filename,"data-lexical-upload-id":b.value,"data-lexical-upload-relation-to":b.relationTo,"data-src":h,children:(0,e.jsxs)("div",{className:`${O}__card`,children:[(0,e.jsx)("div",{className:`${O}__thumbnail`,children:h?.length?(0,e.jsx)("img",{alt:g,src:h}):(0,e.jsx)(N.File,{})}),(0,e.jsxs)("div",{className:`${O}__info`,"data-enable-match":"false",children:[(0,e.jsx)("strong",{children:f?.filename}),(0,e.jsxs)("div",{className:`${O}__meta`,children:[function(a,b=0){if(0===a)return"0 bytes";let c=Math.floor(Math.log(a)/Math.log(1024));return`${parseFloat((a/1024**c).toFixed(b<0?0:b))}${[" bytes","KB","MB","GB","TB","PB","EB","ZB","YB"][c]}`}(f?.filesize),"number"==typeof f?.width&&"number"==typeof f?.height&&(0,e.jsxs)(i.default.Fragment,{children:[" - ",f?.width,"x",f?.height]}),f?.mimeType&&(0,e.jsxs)(i.default.Fragment,{children:[" - ",f?.mimeType]})]})]})]})});return j.renderToStaticMarkup(l)},...(({i18n:b,req:c})=>({relationship:async({node:d,populate:g,providedCSSString:i})=>{let j,k="object"==typeof d.value?d.value.id:d.value;if("object"!=typeof d.value){if(!g)return"";j=await g({id:k,collectionSlug:d.relationTo})}else j=d.value;let l=c.payload.collections[d.relationTo]?.config,m=(await a.A(994653)).default,n=(0,e.jsx)("div",{className:`${L}${i}`,"data-enable-match":"true","data-id":k,"data-slug":d.relationTo,children:(0,e.jsxs)("div",{className:`${L}__card`,children:[(0,e.jsx)("div",{className:`${L}__collectionLabel`,children:b.t("fields:labelRelationship",{label:l?.labels?.singular?(0,f.getTranslation)(l?.labels?.singular,b):l?.slug})}),j&&l?.admin?.useAsTitle&&j[l.admin.useAsTitle]?(0,e.jsx)("strong",{className:`${L}__title`,"data-enable-match":"false",children:(0,e.jsx)("a",{className:`${L}__link`,"data-enable-match":"false",href:(0,h.formatAdminURL)({adminRoute:c.payload.config.routes.admin,path:`/collections/${l?.slug}/${j.id}`,serverURL:c.payload.config.serverURL}),rel:"noopener noreferrer",target:"_blank",children:j[l.admin.useAsTitle]})}):(0,e.jsx)("strong",{children:k})]})});return m.renderToStaticMarkup(n)}}))({i18n:g,req:l}),...(({i18n:b,req:c})=>({unknown:async({node:b,providedCSSString:c})=>{let d=(await a.A(994653)).default,f=(0,I.createHash)("sha256").update(JSON.stringify(b??{})).digest("hex"),g=b.type,h=null;"block"===b.type?(h=b.fields.blockType,g="Block"):"inlineBlock"===b.type&&(h=b.fields.blockType,g="InlineBlock");let i=(0,e.jsxs)("div",{className:`${M}${c}`,"data-enable-match":"true","data-fields-hash":`${f}`,children:[h&&(0,e.jsxs)("span",{className:`${M}__specifier`,children:[h," "]}),(0,e.jsx)("span",{children:g}),(0,e.jsx)("div",{className:`${M}__meta`,children:(0,e.jsx)("br",{})})]});return d.renderToStaticMarkup(i)}}))({i18n:g,req:l})}),r=await H({currentDepth:0,depth:1,req:l}),s=await D({converters:o,data:c,disableContainer:!0,populate:r}),v=await D({converters:o,data:m,disableContainer:!0,populate:r}),{From:w,To:x}=(0,q.getHTMLDiffComponents)({fromHTML:s?.length?s:"<p></p>",toHTML:v?.length?v:"<p></p>"});return(0,e.jsx)(p.FieldDiffContainer,{className:"lexical-diff",From:w,i18n:g,label:{label:d.label,locale:j},nestingLevel:k,To:x})};var Q=a.i(726489),R=a.i(395936);async function S({initPageResult:a}){let b=a.req.payload,[c,d,f,g]=await Promise.all([b.find({collection:"content",where:{status:{in:["draft","review","approved"]}},sort:"-updatedAt",limit:5,depth:0,req:a.req}),b.find({collection:"content",where:{status:{equals:"scheduled"}},sort:"publishedAt",limit:5,depth:0,req:a.req}),b.find({collection:"content",where:{status:{in:["published","updated"]}},sort:"-publishedAt",limit:5,depth:0,req:a.req}),b.find({collection:"public-redirects",where:{enabled:{equals:!0}},limit:1,depth:0,req:a.req})]),h=[{title:"Recent drafts",rows:c.docs,empty:"Start a post or page when you are ready."},{title:"Scheduled",rows:d.docs,empty:"Nothing is scheduled. Choose a publish date to plan ahead."},{title:"Recently published",rows:f.docs,empty:"Published work will appear here with a direct public link."}];return(0,e.jsxs)("main",{className:"gutter--left gutter--right",style:{maxWidth:1120,margin:"0 auto"},children:[(0,e.jsx)("h1",{children:"Dashboard"}),(0,e.jsx)("p",{children:"Your publishing work, in one calm place."}),(0,e.jsxs)("p",{children:[(0,e.jsx)(R.default,{href:"/admin/collections/content/create?contentType=article",children:"Write a post"})," ·"," ",(0,e.jsx)(R.default,{href:"/admin/collections/content/create?contentType=page",children:"Create a page"})," ·"," ",(0,e.jsx)(R.default,{href:"/admin/collections/media-assets/create",children:"Add media"})," ·"," ",(0,e.jsx)(R.default,{href:"/admin/navigation",children:"Edit menus"})]}),(0,e.jsxs)("section",{"aria-label":"Setup progress",style:{marginTop:28},children:[(0,e.jsx)("h2",{children:"Setup progress"}),(0,e.jsxs)("p",{children:[f.docs.length?"Your site has published content.":"Publish your first item to make the site feel lived in."," ",(0,e.jsx)(R.default,{href:"/admin/globals/site-settings",children:"Review Site Settings"})," and"," ",(0,e.jsx)(R.default,{href:"/admin/navigation",children:"add a menu"})," before sharing the site."]})]}),h.map(a=>(0,e.jsxs)("section",{style:{marginTop:28},children:[(0,e.jsx)("h2",{children:a.title}),a.rows.length?(0,e.jsx)("ul",{children:a.rows.map(a=>{let b;return(0,e.jsxs)("li",{children:[(0,e.jsx)(R.default,{href:`/admin/collections/content/${a.id}`,children:a.title?.trim()||"Untitled draft"})," —"," ",a.status??"draft"," · ",(b=a.publishedAt??a.updatedAt)?new Intl.DateTimeFormat("en",{dateStyle:"medium"}).format(new Date(b)):"No date",a.canonicalPath&&["published","updated"].includes(a.status??"")?(0,e.jsxs)(e.Fragment,{children:[" ","·"," ",(0,e.jsx)(R.default,{href:a.canonicalPath,target:"_blank",rel:"noreferrer",children:"View"})]}):null]},a.id)})}):(0,e.jsx)("p",{children:a.empty})]},a.title)),(0,e.jsxs)("section",{style:{marginTop:28},children:[(0,e.jsx)("h2",{children:"Needs attention"}),(0,e.jsx)("p",{children:g.docs.length?"Redirects are active. Review them after moving or renaming content.":"No active redirects. Renaming a published URL creates a safe redirect automatically."}),(0,e.jsxs)("p",{children:["Operational and optional capability failures are available to authorized owners in the"," ",(0,e.jsx)(R.default,{href:"/admin/capabilities",children:"Capability Center"}),"."]})]})]})}var T=a.i(485030),U=a.i(999644);let V=a=>`Extension ${JSON.stringify(a.key)} version ${JSON.stringify(a.version)}`,W=(a,b,c,d)=>{let e="core"===b?"compatibleCore":"compatibleSchema",f=V(a);return(0,U.valid)(c)?(0,U.satisfies)(c,d)?null:`${f} is incompatible with ${b} version ${JSON.stringify(c)}; requested ${e} range ${JSON.stringify(d)} does not include it.`:`${f} cannot be evaluated against ${b} version ${JSON.stringify(c)}; it is not a valid semantic version (requested ${e} range ${JSON.stringify(d)}).`},X={Lean:{memory:"1 GB-class VPS",allowedHeavyWork:!1,explanation:"Queue or externally delegate AI, graph, transcoding, rendering, imports and realtime; preserve reads, forms, authentication, payments and core jobs."},Standard:{memory:"2 GB+",allowedHeavyWork:!0,explanation:"Use workers for imports and media work."},Media:{memory:"4 GB+ with worker",allowedHeavyWork:!0,explanation:"Run media work in a separate constrained worker."},Scale:{memory:"Measured capacity required",allowedHeavyWork:!0,explanation:"Increase concurrency only after queue and public-read measurements."}},Y=[{key:"core.publishing",domainId:"core",required:!0},{key:"editorial.workflow",domainId:"editorial",required:!0},{key:"media.processing",domainId:"media",required:!1,requiresWorker:!0},{key:"social.distribution",domainId:"social",required:!1,providerCapability:"social.publish.text",requiresWorker:!0},{key:"audience.transactional-email",domainId:"audience",required:!1,providerCapability:"email.transactional"},{key:"commerce.checkout",domainId:"commerce",required:!1,providerCapability:"payments.checkout.one_time"},{key:"analytics.reporting",domainId:"analytics",required:!1},{key:"experiences.experiments",domainId:"experiences",required:!1},{key:"quality.scanning",domainId:"quality",required:!1,requiresWorker:!0},{key:"portability.import-export",domainId:"core",required:!1},{key:"extensions.connections",domainId:"extensions",required:!1},{key:"networking.federation",domainId:"networking",required:!1,providerCapability:"federation.activitypub.actor",configurationRequired:!0},{key:"collaboration.realtime",domainId:"collaboration",required:!1,configurationRequired:!0,requiresWorker:!0},{key:"ai.assistance",domainId:"ai",required:!1,providerCapability:"ai.text.rewrite"}],Z=(a,b)=>({code:a,detail:b});class ${source;constructor(a){this.source=a}read(a=new Date().toISOString()){return(this.source.definitions??Y).map(b=>this.withReadiness(this.evaluate(b,a),b))}readiness(a=new Date().toISOString()){let b=this.read(a),c=b.filter(a=>a.required&&!["healthy","available"].includes(a.status));return{status:c.length?"not_ready":"ready",capabilities:b,blocking:c}}withReadiness(a,b){let c="disabled"===a.status?"disabled":"configuring"===a.status||"misconfigured"===a.status?"configuration-required":a.reason?.code==="missing_provider"?"credential-required":a.reason?.code==="core_database_unavailable"?"unhealthy":"degraded"===a.status?"degraded":"unavailable"===a.status?"unavailable":"available"===a.status?"available":"enabled";return{...a,readiness:c,requiresExternalProvider:!!b.providerCapability,requiresWorker:!!b.requiresWorker}}evaluate(a,b){let c=this.source.evidence?.[a.key]??{},d=c.exists??!0,e=c.enabled??a.required,f=a.configurationRequired?c.configuration??"incomplete":c.configuration??"not-required",g={...a,exists:d,enabled:e,configuration:f};if(!d)return{...g,status:"unavailable",reason:Z("capability_not_installed","Capability is not installed.")};if(!e)return{...g,status:"disabled",reason:Z("feature_intentionally_disabled","Feature is intentionally disabled.")};if("invalid"===f)return{...g,status:"misconfigured",reason:Z("invalid_configuration","Configuration is invalid.")};if("incomplete"===f)return{...g,status:"configuring",reason:Z("missing_configuration","Required configuration is missing.")};let h=this.source.manifests??[];if(h.some(b=>{var c,d;let e,f;return b.provides.includes(a.providerCapability)&&(c=this.source.coreVersion,d=this.source.schemaVersion,e=new Set(h.map(a=>a.key)),[...f=function(a){let b=V(a),c=[];for(let[d,e]of((0,U.valid)(a.version)||c.push(`${b} has an invalid extension version; expected a valid semantic version.`),[["compatibleCore",a.compatibleCore],["compatibleSchema",a.compatibleSchema]]))(0,U.validRange)(e)||c.push(`${b} has an invalid ${d} range ${JSON.stringify(e)}.`);return c}(b),...f.some(a=>a.includes("compatibleCore"))?[]:[W(b,"core",c,b.compatibleCore)].filter(a=>null!==a),...f.some(a=>a.includes("compatibleSchema"))?[]:[W(b,"schema",d,b.compatibleSchema)].filter(a=>null!==a),...b.dependencies.filter(a=>!e.has(a)).map(a=>`missing dependency: ${a}`),...b.conflicts.filter(a=>e.has(a)).map(a=>`conflict: ${a}`)]).length}))return{...g,status:"misconfigured",reason:Z("dependency_incompatible","An extension dependency is incompatible.")};if(a.requiresWorker&&this.source.workers?.[a.key]==="unavailable")return{...g,status:"degraded",reason:Z("worker_unavailable","Required worker is unavailable.")};if(a.requiresWorker&&!X[this.source.profile].allowedHeavyWork)return{...g,status:"available",reason:null};if(a.providerCapability){let c=(this.source.connections??[]).filter(b=>b.capabilities.some(b=>b.key===a.providerCapability));if(!c.length)return{...g,status:"unavailable",reason:Z("missing_provider","No provider supports this capability.")};if(c.some(a=>"expired"===a.status||a.lastError?.code==="expired_credentials"))return{...g,status:"degraded",reason:Z("credential_expired","Provider credentials have expired.")};if(!c.some(c=>{let d;return d=a.providerCapability,"active"===c.status&&(!c.expiresAt||c.expiresAt>b)&&c.capabilities.some(a=>a.key===d&&"supported"===a.support)}))return{...g,status:"degraded",reason:Z("provider_unavailable","Configured provider is unavailable.")}}return"unavailable"===c.health?{...g,status:"unavailable",reason:Z("core_database_unavailable","Required core database is unavailable.")}:"degraded"===c.health?{...g,status:"degraded",reason:Z("provider_unavailable","Dependency is degraded.")}:{...g,status:a.providerCapability||"healthy"===c.health||a.requiresWorker&&this.source.workers?.[a.key]==="healthy"?"healthy":"available",reason:null}}}var _=a.i(199708),aa=a.i(351674);let ab=["content","events","timelines"],ac=[{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   CREATE TYPE "public"."enum_sites_lifecycle" AS ENUM('draft', 'active', 'archived');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "sites" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"lifecycle" "enum_sites_lifecycle" DEFAULT 'active' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid,
  	"sites_id" uuid
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sites_fk" FOREIGN KEY ("sites_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "sites_slug_idx" ON "sites" USING btree ("slug");
  CREATE INDEX "sites_updated_at_idx" ON "sites" USING btree ("updated_at");
  CREATE INDEX "sites_created_at_idx" ON "sites" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_sites_id_idx" ON "payload_locked_documents_rels" USING btree ("sites_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)},down:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "sites" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_sites_lifecycle";`)},name:"20260812_010209_initial_foundation"},{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure');
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"concurrency_key" varchar,
  	"meta" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload_jobs" USING btree ("concurrency_key");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");`)},down:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)},name:"20260812_034055_m02_operations_jobs"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TYPE "public"."enum_users_role" AS ENUM('owner', 'staff');
    CREATE TYPE "public"."enum_installation_state_state" AS ENUM('incomplete', 'installing', 'complete');
    ALTER TABLE "users" DROP COLUMN "reset_password_token", DROP COLUMN "reset_password_expiration", DROP COLUMN "salt", DROP COLUMN "hash", DROP COLUMN "login_attempts", DROP COLUMN "lock_until";
    DROP TABLE "users_sessions";
    ALTER TABLE "users" ADD COLUMN "role" "enum_users_role" DEFAULT 'owner' NOT NULL;
    CREATE TABLE "installation_state" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "singleton" boolean DEFAULT true NOT NULL,
      "state" "enum_installation_state_state" DEFAULT 'incomplete' NOT NULL,
      "bootstrap_token_hash" varchar,
      "bootstrap_expires_at" timestamp(3) with time zone,
      "registration_challenge" varchar,
      "registration_email" varchar,
      "owner_user_id" uuid,
      "completed_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "passkeys" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "credential_id" varchar NOT NULL,
      "public_key" varchar NOT NULL,
      "counter" bigint DEFAULT 0 NOT NULL,
      "device_type" varchar NOT NULL,
      "backed_up" boolean DEFAULT false NOT NULL,
      "login_challenge" varchar,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "recovery_codes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "code_hash" varchar NOT NULL,
      "used_at" timestamp(3) with time zone
    );
    ALTER TABLE "installation_state" ADD CONSTRAINT "installation_state_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE no action;
    ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    CREATE UNIQUE INDEX "installation_state_singleton_idx" ON "installation_state" USING btree ("singleton");
    CREATE UNIQUE INDEX "passkeys_credential_id_idx" ON "passkeys" USING btree ("credential_id");
    CREATE UNIQUE INDEX "recovery_codes_code_hash_idx" ON "recovery_codes" USING btree ("code_hash");
    CREATE INDEX "passkeys_user_id_idx" ON "passkeys" USING btree ("user_id");
    CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");`)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE "recovery_codes" CASCADE;
    DROP TABLE "passkeys" CASCADE;
    DROP TABLE "installation_state" CASCADE;
    ALTER TABLE "users" DROP COLUMN "role";
    CREATE TABLE "users_sessions" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "created_at" timestamp(3) with time zone,
      "expires_at" timestamp(3) with time zone NOT NULL,
      CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    );
    ALTER TABLE "users" ADD COLUMN "reset_password_token" varchar, ADD COLUMN "reset_password_expiration" timestamp(3) with time zone, ADD COLUMN "salt" varchar, ADD COLUMN "hash" varchar, ADD COLUMN "login_attempts" numeric DEFAULT 0, ADD COLUMN "lock_until" timestamp(3) with time zone;
    DROP TYPE "public"."enum_installation_state_state";
    DROP TYPE "public"."enum_users_role";`)},name:"20260812_080000_m02_first_run_installation"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "installation_state" ADD COLUMN "registration_session_hash" varchar;`)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "installation_state" DROP COLUMN "registration_session_hash";`)},name:"20260812_081000_m02_single_use_setup_token"},{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
  CREATE TYPE "public"."enum_brands_kind" AS ENUM('organization', 'personal');
  CREATE TYPE "public"."enum_members_status" AS ENUM('active', 'disabled', 'archived');
  CREATE TYPE "public"."enum_profiles_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_spaces_capabilities_status" AS ENUM('enabled', 'disabled');
  CREATE TYPE "public"."enum_spaces_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_spaces_moderation_state" AS ENUM('clear', 'review', 'restricted', 'removed');
  CREATE TYPE "public"."enum_spaces_transfer_state" AS ENUM('none', 'pending', 'completed');
  CREATE TYPE "public"."enum_publications_capabilities_status" AS ENUM('enabled', 'disabled');
  CREATE TYPE "public"."enum_publications_status" AS ENUM('draft', 'active', 'suspended', 'archived');
  CREATE TYPE "public"."enum_publications_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_relationships_kind" AS ENUM('follow', 'friend', 'block', 'mute', 'publication-membership', 'content-association', 'curation');
  CREATE TYPE "public"."enum_relationships_status" AS ENUM('pending', 'active', 'blocked', 'archived');
  CREATE TYPE "public"."enum_relationships_role" AS ENUM('owner', 'editor', 'author', 'moderator', 'member');
  CREATE TYPE "public"."enum_relationships_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_media_assets_kind" AS ENUM('image', 'audio', 'video', 'document', 'cover', 'thumbnail', 'graphic');
  CREATE TYPE "public"."enum_media_assets_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_media_assets_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_sections_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_categories_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_topics_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_tags_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_series_scope" AS ENUM('site', 'publication');
  CREATE TYPE "public"."enum_taxonomy_redirects_reason" AS ENUM('rename', 'move');
  CREATE TYPE "public"."enum_content_content_type" AS ENUM('article', 'page', 'book', 'podcast', 'video', 'product', 'event', 'campaign');
  CREATE TYPE "public"."enum_content_status" AS ENUM('draft', 'review', 'published', 'scheduled', 'archived');
  CREATE TYPE "public"."enum_content_comments_policy" AS ENUM('open', 'members', 'closed');
  CREATE TYPE "public"."enum_content_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_content_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_sources_source_type" AS ENUM('article', 'book', 'report', 'dataset', 'interview', 'website', 'other');
  CREATE TYPE "public"."enum_albums_kind" AS ENUM('album', 'portfolio');
  CREATE TYPE "public"."enum_albums_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_albums_original_download_policy" AS ENUM('allowed', 'members', 'disallowed');
  CREATE TYPE "public"."enum_albums_exif_policy" AS ENUM('strip', 'private', 'display');
  CREATE TYPE "public"."enum_albums_comments_policy" AS ENUM('open', 'members', 'closed');
  CREATE TYPE "public"."enum_albums_moderation_state" AS ENUM('clear', 'review', 'restricted', 'removed');
  CREATE TYPE "public"."enum_albums_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_albums_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_media_usages_purpose" AS ENUM('hero', 'inline', 'cover', 'attachment', 'avatar', 'thumbnail');
  CREATE TYPE "public"."enum_discussions_kind" AS ENUM('attached', 'thread');
  CREATE TYPE "public"."enum_discussions_status" AS ENUM('open', 'locked', 'archived');
  CREATE TYPE "public"."enum_discussions_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_discussions_moderation_state" AS ENUM('clear', 'review', 'restricted', 'removed');
  CREATE TYPE "public"."enum_discussions_comments_policy" AS ENUM('open', 'members', 'closed');
  CREATE TYPE "public"."enum_discussions_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_discussions_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_discussion_posts_status" AS ENUM('draft', 'published', 'hidden', 'removed');
  CREATE TYPE "public"."enum_discussion_posts_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_discussion_posts_moderation_state" AS ENUM('clear', 'review', 'restricted', 'removed');
  CREATE TYPE "public"."enum_discussion_posts_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_discussion_posts_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TYPE "public"."enum_calendar_entries_status" AS ENUM('draft', 'scheduled', 'in-progress', 'completed', 'cancelled', 'archived');
  CREATE TYPE "public"."enum_calendar_entries_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_calendar_entries_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_calendar_entries_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TABLE "brands" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"legal_name" varchar,
  	"kind" "enum_brands_kind" DEFAULT 'organization' NOT NULL,
  	"tagline" varchar,
  	"mission" varchar,
  	"description" varchar,
  	"bio" varchar,
  	"logo_id" uuid,
  	"favicon_id" uuid,
  	"colors" jsonb,
  	"typography" jsonb,
  	"contact_defaults" jsonb,
  	"social_defaults" jsonb,
  	"primary_author_id" uuid,
  	"audience" varchar,
  	"voice" varchar,
  	"vocabulary" jsonb,
  	"avoided_phrases" jsonb,
  	"graphic_style" varchar,
  	"seo_defaults" jsonb,
  	"social_defaults_override" jsonb,
  	"newsletter_defaults" jsonb,
  	"disclosures" varchar,
  	"structured_data_defaults" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "members" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"display_name" varchar NOT NULL,
  	"email" varchar,
  	"status" "enum_members_status" DEFAULT 'active' NOT NULL,
  	"disabled_at" timestamp(3) with time zone,
  	"archived_at" timestamp(3) with time zone,
  	"export_requested_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "profiles" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"display_name" varchar NOT NULL,
  	"avatar_id" uuid,
  	"cover_id" uuid,
  	"bio" varchar,
  	"visibility" "enum_profiles_visibility" DEFAULT 'public' NOT NULL,
  	"field_audience" jsonb,
  	"layout_theme" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "spaces_capabilities" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"status" "enum_spaces_capabilities_status" DEFAULT 'enabled' NOT NULL
  );
  
  CREATE TABLE "spaces" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"profile_id" uuid,
  	"handle" varchar NOT NULL,
  	"canonical_path" varchar DEFAULT '/members/' NOT NULL,
  	"display_name" varchar NOT NULL,
  	"avatar_id" uuid,
  	"cover_id" uuid,
  	"bio" varchar,
  	"visibility" "enum_spaces_visibility" DEFAULT 'public' NOT NULL,
  	"field_audience" jsonb,
  	"layout_theme" jsonb,
  	"quota_policy" jsonb,
  	"provider_ownership" jsonb,
  	"moderation_state" "enum_spaces_moderation_state" DEFAULT 'clear' NOT NULL,
  	"suspended_at" timestamp(3) with time zone,
  	"transfer_to_member_id" uuid,
  	"transfer_state" "enum_spaces_transfer_state" DEFAULT 'none',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "authors" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"display_name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"member_id" uuid,
  	"bio" varchar,
  	"avatar_id" uuid,
  	"website" varchar,
  	"social_links" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "publications_capabilities" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"status" "enum_publications_capabilities_status" DEFAULT 'enabled' NOT NULL
  );
  
  CREATE TABLE "publications" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"owner_id" uuid,
  	"space_id" uuid,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_base_path" varchar DEFAULT '/blogs/' NOT NULL,
  	"status" "enum_publications_status" DEFAULT 'draft' NOT NULL,
  	"visibility" "enum_publications_visibility" DEFAULT 'public' NOT NULL,
  	"brand_id" uuid,
  	"profile_id" uuid,
  	"brand_overrides" jsonb,
  	"theme_preset" varchar,
  	"moderation_policy" jsonb,
  	"feature_policy" jsonb,
  	"quota_policy" jsonb,
  	"navigation" jsonb,
  	"feeds" jsonb,
  	"seo_defaults" jsonb,
  	"suspended_at" timestamp(3) with time zone,
  	"archived_at" timestamp(3) with time zone,
  	"archive_message" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "relationships" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"subject_id" uuid NOT NULL,
  	"kind" "enum_relationships_kind" NOT NULL,
  	"status" "enum_relationships_status" DEFAULT 'active' NOT NULL,
  	"role" "enum_relationships_role",
  	"visibility" "enum_relationships_visibility" DEFAULT 'private' NOT NULL,
  	"started_at" timestamp(3) with time zone,
  	"ended_at" timestamp(3) with time zone,
  	"pair_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "relationships_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"members_id" uuid,
  	"publications_id" uuid,
  	"content_id" uuid,
  	"albums_id" uuid,
  	"media_assets_id" uuid
  );
  
  CREATE TABLE "media_assets_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"location" varchar NOT NULL,
  	"mime_type" varchar
  );
  
  CREATE TABLE "media_assets" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"kind" "enum_media_assets_kind" NOT NULL,
  	"storage_location" varchar NOT NULL,
  	"storage_provider" varchar DEFAULT 'local' NOT NULL,
  	"mime_type" varchar,
  	"size_bytes" numeric,
  	"width" numeric,
  	"height" numeric,
  	"duration_seconds" numeric,
  	"alt_text" varchar,
  	"caption" varchar,
  	"credits" varchar,
  	"license" varchar,
  	"replace_globally_with_id" uuid,
  	"original_export_allowed" boolean DEFAULT true,
  	"retention_mode" "enum_media_assets_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_media_assets_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_assets_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" uuid,
  	"albums_id" uuid
  );
  
  CREATE TABLE "sections" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_sections_scope" DEFAULT 'publication' NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_categories_scope" DEFAULT 'publication' NOT NULL,
  	"section_id" uuid,
  	"parent_id" uuid,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_path" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "topics" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_topics_scope" DEFAULT 'publication' NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_tags_scope" DEFAULT 'publication' NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "series" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"scope" "enum_series_scope" DEFAULT 'publication' NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "taxonomy_redirects" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"from_path" varchar NOT NULL,
  	"to_path" varchar NOT NULL,
  	"reason" "enum_taxonomy_redirects_reason" NOT NULL,
  	"target_category_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "content_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"author_id" uuid NOT NULL,
  	"display_order" numeric DEFAULT 0 NOT NULL,
  	"role" varchar
  );
  
  CREATE TABLE "content" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"content_type" "enum_content_content_type" NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_path" varchar NOT NULL,
  	"summary" varchar,
  	"status" "enum_content_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"updated_at_editorial" timestamp(3) with time zone,
  	"hero_media_id" uuid,
  	"seo_override" jsonb,
  	"social_override" jsonb,
  	"comments_policy" "enum_content_comments_policy" DEFAULT 'open' NOT NULL,
  	"revision_compatibility" jsonb,
  	"audit_metadata" jsonb,
  	"retention_mode" "enum_content_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_content_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "content_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"sections_id" uuid,
  	"categories_id" uuid,
  	"topics_id" uuid,
  	"tags_id" uuid,
  	"series_id" uuid,
  	"relationships_id" uuid
  );
  
  CREATE TABLE "sources" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"title" varchar NOT NULL,
  	"publisher" varchar,
  	"authors" jsonb,
  	"url" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"accessed_at" timestamp(3) with time zone,
  	"source_type" "enum_sources_source_type" NOT NULL,
  	"excerpt" varchar,
  	"quote_metadata" jsonb,
  	"archive_metadata" jsonb,
  	"credibility_notes" varchar,
  	"editorial_notes" varchar,
  	"reuse_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "albums_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" uuid NOT NULL,
  	"display_order" numeric DEFAULT 0 NOT NULL,
  	"caption" varchar,
  	"alt_text" varchar,
  	"credits" varchar,
  	"license" varchar
  );
  
  CREATE TABLE "albums" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"kind" "enum_albums_kind" NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_path" varchar NOT NULL,
  	"description" varchar,
  	"cover_id" uuid,
  	"visibility" "enum_albums_visibility" DEFAULT 'public' NOT NULL,
  	"original_download_policy" "enum_albums_original_download_policy" DEFAULT 'allowed' NOT NULL,
  	"exif_policy" "enum_albums_exif_policy" DEFAULT 'strip' NOT NULL,
  	"comments_policy" "enum_albums_comments_policy" DEFAULT 'open' NOT NULL,
  	"moderation_state" "enum_albums_moderation_state" DEFAULT 'clear' NOT NULL,
  	"export_requested_at" timestamp(3) with time zone,
  	"retention_mode" "enum_albums_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_albums_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_usages" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"media_id" uuid NOT NULL,
  	"usage_key" varchar NOT NULL,
  	"purpose" "enum_media_usages_purpose" NOT NULL,
  	"replace_globally" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_usages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"content_id" uuid,
  	"albums_id" uuid,
  	"discussions_id" uuid,
  	"discussion_posts_id" uuid
  );
  
  CREATE TABLE "forum_sections" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "forums" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"section_id" uuid NOT NULL,
  	"parent_id" uuid,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discussions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"kind" "enum_discussions_kind" NOT NULL,
  	"title" varchar NOT NULL,
  	"forum_id" uuid,
  	"promoted_content_id" uuid,
  	"canonical_path" varchar NOT NULL,
  	"status" "enum_discussions_status" DEFAULT 'open' NOT NULL,
  	"visibility" "enum_discussions_visibility" DEFAULT 'public' NOT NULL,
  	"moderation_state" "enum_discussions_moderation_state" DEFAULT 'clear' NOT NULL,
  	"comments_policy" "enum_discussions_comments_policy" DEFAULT 'open' NOT NULL,
  	"retention_mode" "enum_discussions_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_discussions_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discussions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"content_id" uuid,
  	"media_assets_id" uuid,
  	"albums_id" uuid
  );
  
  CREATE TABLE "discussion_posts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"discussion_id" uuid NOT NULL,
  	"author_member_id" uuid,
  	"author_guest_id" uuid,
  	"body" varchar NOT NULL,
  	"parent_id" uuid,
  	"quote_id" uuid,
  	"display_order" numeric DEFAULT 0 NOT NULL,
  	"permalink" varchar NOT NULL,
  	"pagination_anchor" varchar NOT NULL,
  	"status" "enum_discussion_posts_status" DEFAULT 'published' NOT NULL,
  	"visibility" "enum_discussion_posts_visibility" DEFAULT 'public' NOT NULL,
  	"solution" boolean DEFAULT false,
  	"helpful" boolean DEFAULT false,
  	"moderation_state" "enum_discussion_posts_moderation_state" DEFAULT 'clear' NOT NULL,
  	"retention_mode" "enum_discussion_posts_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_discussion_posts_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discussion_posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_assets_id" uuid,
  	"sources_id" uuid
  );
  
  CREATE TABLE "calendar_entries" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"all_day" boolean DEFAULT false,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone,
  	"time_zone" varchar DEFAULT 'UTC' NOT NULL,
  	"status" "enum_calendar_entries_status" DEFAULT 'scheduled' NOT NULL,
  	"visibility" "enum_calendar_entries_visibility" DEFAULT 'private' NOT NULL,
  	"audience" jsonb,
  	"calendar_placement" varchar,
  	"recurrence" jsonb,
  	"rsvp_registration" jsonb,
  	"conflict_metadata" jsonb,
  	"canonical_path" varchar,
  	"structured_data" jsonb,
  	"retention_mode" "enum_calendar_entries_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_calendar_entries_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "calendar_entries_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"content_id" uuid,
  	"publications_id" uuid,
  	"media_assets_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "brands_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "members_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "profiles_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "spaces_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "authors_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "publications_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "relationships_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_assets_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sections_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categories_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "topics_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tags_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "series_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "taxonomy_redirects_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sources_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "albums_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_usages_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "forum_sections_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "forums_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussion_posts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "calendar_entries_id" uuid;
  ALTER TABLE "brands" ADD CONSTRAINT "brands_logo_id_media_assets_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "brands" ADD CONSTRAINT "brands_favicon_id_media_assets_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "brands" ADD CONSTRAINT "brands_primary_author_id_authors_id_fk" FOREIGN KEY ("primary_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_id_media_assets_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces_capabilities" ADD CONSTRAINT "spaces_capabilities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_avatar_id_media_assets_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "spaces" ADD CONSTRAINT "spaces_transfer_to_member_id_members_id_fk" FOREIGN KEY ("transfer_to_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_avatar_id_media_assets_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications_capabilities" ADD CONSTRAINT "publications_capabilities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationships" ADD CONSTRAINT "relationships_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationships" ADD CONSTRAINT "relationships_subject_id_members_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "relationships_rels" ADD CONSTRAINT "relationships_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_assets_variants" ADD CONSTRAINT "media_assets_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_replace_globally_with_id_media_assets_id_fk" FOREIGN KEY ("replace_globally_with_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_assets_rels" ADD CONSTRAINT "media_assets_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_assets_rels" ADD CONSTRAINT "media_assets_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_assets_rels" ADD CONSTRAINT "media_assets_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sections" ADD CONSTRAINT "sections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sections" ADD CONSTRAINT "sections_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics" ADD CONSTRAINT "topics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics" ADD CONSTRAINT "topics_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "series" ADD CONSTRAINT "series_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "series" ADD CONSTRAINT "series_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "taxonomy_redirects" ADD CONSTRAINT "taxonomy_redirects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "taxonomy_redirects" ADD CONSTRAINT "taxonomy_redirects_target_category_id_categories_id_fk" FOREIGN KEY ("target_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_authors" ADD CONSTRAINT "content_authors_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_authors" ADD CONSTRAINT "content_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content" ADD CONSTRAINT "content_hero_media_id_media_assets_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_series_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_relationships_fk" FOREIGN KEY ("relationships_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums_items" ADD CONSTRAINT "albums_items_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums_items" ADD CONSTRAINT "albums_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_usages" ADD CONSTRAINT "media_usages_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_usages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_discussions_fk" FOREIGN KEY ("discussions_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_discussion_posts_fk" FOREIGN KEY ("discussion_posts_id") REFERENCES "public"."discussion_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forum_sections" ADD CONSTRAINT "forum_sections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forum_sections" ADD CONSTRAINT "forum_sections_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forum_sections" ADD CONSTRAINT "forum_sections_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_section_id_forum_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."forum_sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forums" ADD CONSTRAINT "forums_parent_id_forums_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."forums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_forum_id_forums_id_fk" FOREIGN KEY ("forum_id") REFERENCES "public"."forums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions" ADD CONSTRAINT "discussions_promoted_content_id_content_id_fk" FOREIGN KEY ("promoted_content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussions_rels" ADD CONSTRAINT "discussions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussions_rels" ADD CONSTRAINT "discussions_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussions_rels" ADD CONSTRAINT "discussions_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussions_rels" ADD CONSTRAINT "discussions_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_discussion_id_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."discussions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_author_guest_id_authors_id_fk" FOREIGN KEY ("author_guest_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_parent_id_discussion_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discussion_posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_quote_id_discussion_posts_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."discussion_posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_posts_rels" ADD CONSTRAINT "discussion_posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discussion_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussion_posts_rels" ADD CONSTRAINT "discussion_posts_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discussion_posts_rels" ADD CONSTRAINT "discussion_posts_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."calendar_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "brands_logo_idx" ON "brands" USING btree ("logo_id");
  CREATE INDEX "brands_favicon_idx" ON "brands" USING btree ("favicon_id");
  CREATE INDEX "brands_primary_author_idx" ON "brands" USING btree ("primary_author_id");
  CREATE INDEX "brands_updated_at_idx" ON "brands" USING btree ("updated_at");
  CREATE INDEX "brands_created_at_idx" ON "brands" USING btree ("created_at");
  CREATE UNIQUE INDEX "members_email_idx" ON "members" USING btree ("email");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE UNIQUE INDEX "profiles_member_idx" ON "profiles" USING btree ("member_id");
  CREATE INDEX "profiles_avatar_idx" ON "profiles" USING btree ("avatar_id");
  CREATE INDEX "profiles_cover_idx" ON "profiles" USING btree ("cover_id");
  CREATE INDEX "profiles_updated_at_idx" ON "profiles" USING btree ("updated_at");
  CREATE INDEX "profiles_created_at_idx" ON "profiles" USING btree ("created_at");
  CREATE INDEX "spaces_capabilities_order_idx" ON "spaces_capabilities" USING btree ("_order");
  CREATE INDEX "spaces_capabilities_parent_id_idx" ON "spaces_capabilities" USING btree ("_parent_id");
  CREATE INDEX "spaces_member_idx" ON "spaces" USING btree ("member_id");
  CREATE INDEX "spaces_profile_idx" ON "spaces" USING btree ("profile_id");
  CREATE UNIQUE INDEX "spaces_handle_idx" ON "spaces" USING btree ("handle");
  CREATE UNIQUE INDEX "spaces_canonical_path_idx" ON "spaces" USING btree ("canonical_path");
  CREATE INDEX "spaces_avatar_idx" ON "spaces" USING btree ("avatar_id");
  CREATE INDEX "spaces_cover_idx" ON "spaces" USING btree ("cover_id");
  CREATE INDEX "spaces_transfer_to_member_idx" ON "spaces" USING btree ("transfer_to_member_id");
  CREATE INDEX "spaces_updated_at_idx" ON "spaces" USING btree ("updated_at");
  CREATE INDEX "spaces_created_at_idx" ON "spaces" USING btree ("created_at");
  CREATE UNIQUE INDEX "authors_slug_idx" ON "authors" USING btree ("slug");
  CREATE UNIQUE INDEX "authors_member_idx" ON "authors" USING btree ("member_id");
  CREATE INDEX "authors_avatar_idx" ON "authors" USING btree ("avatar_id");
  CREATE INDEX "authors_updated_at_idx" ON "authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "authors" USING btree ("created_at");
  CREATE INDEX "publications_capabilities_order_idx" ON "publications_capabilities" USING btree ("_order");
  CREATE INDEX "publications_capabilities_parent_id_idx" ON "publications_capabilities" USING btree ("_parent_id");
  CREATE INDEX "publications_site_idx" ON "publications" USING btree ("site_id");
  CREATE INDEX "publications_owner_idx" ON "publications" USING btree ("owner_id");
  CREATE INDEX "publications_space_idx" ON "publications" USING btree ("space_id");
  CREATE INDEX "publications_slug_idx" ON "publications" USING btree ("slug");
  CREATE INDEX "publications_brand_idx" ON "publications" USING btree ("brand_id");
  CREATE INDEX "publications_profile_idx" ON "publications" USING btree ("profile_id");
  CREATE INDEX "publications_updated_at_idx" ON "publications" USING btree ("updated_at");
  CREATE INDEX "publications_created_at_idx" ON "publications" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_slug_idx" ON "publications" USING btree ("site_id","slug");
  CREATE INDEX "relationships_site_idx" ON "relationships" USING btree ("site_id");
  CREATE INDEX "relationships_subject_idx" ON "relationships" USING btree ("subject_id");
  CREATE UNIQUE INDEX "relationships_pair_key_idx" ON "relationships" USING btree ("pair_key");
  CREATE INDEX "relationships_updated_at_idx" ON "relationships" USING btree ("updated_at");
  CREATE INDEX "relationships_created_at_idx" ON "relationships" USING btree ("created_at");
  CREATE INDEX "relationships_rels_order_idx" ON "relationships_rels" USING btree ("order");
  CREATE INDEX "relationships_rels_parent_idx" ON "relationships_rels" USING btree ("parent_id");
  CREATE INDEX "relationships_rels_path_idx" ON "relationships_rels" USING btree ("path");
  CREATE INDEX "relationships_rels_members_id_idx" ON "relationships_rels" USING btree ("members_id");
  CREATE INDEX "relationships_rels_publications_id_idx" ON "relationships_rels" USING btree ("publications_id");
  CREATE INDEX "relationships_rels_content_id_idx" ON "relationships_rels" USING btree ("content_id");
  CREATE INDEX "relationships_rels_albums_id_idx" ON "relationships_rels" USING btree ("albums_id");
  CREATE INDEX "relationships_rels_media_assets_id_idx" ON "relationships_rels" USING btree ("media_assets_id");
  CREATE INDEX "media_assets_variants_order_idx" ON "media_assets_variants" USING btree ("_order");
  CREATE INDEX "media_assets_variants_parent_id_idx" ON "media_assets_variants" USING btree ("_parent_id");
  CREATE INDEX "media_assets_site_idx" ON "media_assets" USING btree ("site_id");
  CREATE INDEX "media_assets_publication_idx" ON "media_assets" USING btree ("publication_id");
  CREATE INDEX "media_assets_space_idx" ON "media_assets" USING btree ("space_id");
  CREATE INDEX "media_assets_owner_idx" ON "media_assets" USING btree ("owner_id");
  CREATE UNIQUE INDEX "media_assets_storage_location_idx" ON "media_assets" USING btree ("storage_location");
  CREATE INDEX "media_assets_replace_globally_with_idx" ON "media_assets" USING btree ("replace_globally_with_id");
  CREATE INDEX "media_assets_updated_at_idx" ON "media_assets" USING btree ("updated_at");
  CREATE INDEX "media_assets_created_at_idx" ON "media_assets" USING btree ("created_at");
  CREATE INDEX "media_assets_rels_order_idx" ON "media_assets_rels" USING btree ("order");
  CREATE INDEX "media_assets_rels_parent_idx" ON "media_assets_rels" USING btree ("parent_id");
  CREATE INDEX "media_assets_rels_path_idx" ON "media_assets_rels" USING btree ("path");
  CREATE INDEX "media_assets_rels_tags_id_idx" ON "media_assets_rels" USING btree ("tags_id");
  CREATE INDEX "media_assets_rels_albums_id_idx" ON "media_assets_rels" USING btree ("albums_id");
  CREATE INDEX "sections_site_idx" ON "sections" USING btree ("site_id");
  CREATE INDEX "sections_publication_idx" ON "sections" USING btree ("publication_id");
  CREATE INDEX "sections_updated_at_idx" ON "sections" USING btree ("updated_at");
  CREATE INDEX "sections_created_at_idx" ON "sections" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_slug_idx" ON "sections" USING btree ("site_id","publication_id","slug");
  CREATE INDEX "categories_site_idx" ON "categories" USING btree ("site_id");
  CREATE INDEX "categories_publication_idx" ON "categories" USING btree ("publication_id");
  CREATE INDEX "categories_section_idx" ON "categories" USING btree ("section_id");
  CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_parent_slug_idx" ON "categories" USING btree ("site_id","publication_id","parent_id","slug");
  CREATE INDEX "topics_site_idx" ON "topics" USING btree ("site_id");
  CREATE INDEX "topics_publication_idx" ON "topics" USING btree ("publication_id");
  CREATE INDEX "topics_updated_at_idx" ON "topics" USING btree ("updated_at");
  CREATE INDEX "topics_created_at_idx" ON "topics" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_slug_1_idx" ON "topics" USING btree ("site_id","publication_id","slug");
  CREATE INDEX "tags_site_idx" ON "tags" USING btree ("site_id");
  CREATE INDEX "tags_publication_idx" ON "tags" USING btree ("publication_id");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_slug_2_idx" ON "tags" USING btree ("site_id","publication_id","slug");
  CREATE INDEX "series_site_idx" ON "series" USING btree ("site_id");
  CREATE INDEX "series_publication_idx" ON "series" USING btree ("publication_id");
  CREATE INDEX "series_updated_at_idx" ON "series" USING btree ("updated_at");
  CREATE INDEX "series_created_at_idx" ON "series" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_publication_slug_3_idx" ON "series" USING btree ("site_id","publication_id","slug");
  CREATE INDEX "taxonomy_redirects_site_idx" ON "taxonomy_redirects" USING btree ("site_id");
  CREATE UNIQUE INDEX "taxonomy_redirects_from_path_idx" ON "taxonomy_redirects" USING btree ("from_path");
  CREATE INDEX "taxonomy_redirects_target_category_idx" ON "taxonomy_redirects" USING btree ("target_category_id");
  CREATE INDEX "taxonomy_redirects_updated_at_idx" ON "taxonomy_redirects" USING btree ("updated_at");
  CREATE INDEX "taxonomy_redirects_created_at_idx" ON "taxonomy_redirects" USING btree ("created_at");
  CREATE INDEX "content_authors_order_idx" ON "content_authors" USING btree ("_order");
  CREATE INDEX "content_authors_parent_id_idx" ON "content_authors" USING btree ("_parent_id");
  CREATE INDEX "content_authors_author_idx" ON "content_authors" USING btree ("author_id");
  CREATE INDEX "content_site_idx" ON "content" USING btree ("site_id");
  CREATE INDEX "content_publication_idx" ON "content" USING btree ("publication_id");
  CREATE INDEX "content_space_idx" ON "content" USING btree ("space_id");
  CREATE INDEX "content_owner_idx" ON "content" USING btree ("owner_id");
  CREATE UNIQUE INDEX "content_canonical_path_idx" ON "content" USING btree ("canonical_path");
  CREATE INDEX "content_hero_media_idx" ON "content" USING btree ("hero_media_id");
  CREATE INDEX "content_updated_at_idx" ON "content" USING btree ("updated_at");
  CREATE INDEX "content_created_at_idx" ON "content" USING btree ("created_at");
  CREATE UNIQUE INDEX "publication_slug_idx" ON "content" USING btree ("publication_id","slug");
  CREATE INDEX "content_rels_order_idx" ON "content_rels" USING btree ("order");
  CREATE INDEX "content_rels_parent_idx" ON "content_rels" USING btree ("parent_id");
  CREATE INDEX "content_rels_path_idx" ON "content_rels" USING btree ("path");
  CREATE INDEX "content_rels_sections_id_idx" ON "content_rels" USING btree ("sections_id");
  CREATE INDEX "content_rels_categories_id_idx" ON "content_rels" USING btree ("categories_id");
  CREATE INDEX "content_rels_topics_id_idx" ON "content_rels" USING btree ("topics_id");
  CREATE INDEX "content_rels_tags_id_idx" ON "content_rels" USING btree ("tags_id");
  CREATE INDEX "content_rels_series_id_idx" ON "content_rels" USING btree ("series_id");
  CREATE INDEX "content_rels_relationships_id_idx" ON "content_rels" USING btree ("relationships_id");
  CREATE INDEX "sources_site_idx" ON "sources" USING btree ("site_id");
  CREATE INDEX "sources_publication_idx" ON "sources" USING btree ("publication_id");
  CREATE INDEX "sources_space_idx" ON "sources" USING btree ("space_id");
  CREATE UNIQUE INDEX "sources_url_idx" ON "sources" USING btree ("url");
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  CREATE INDEX "albums_items_order_idx" ON "albums_items" USING btree ("_order");
  CREATE INDEX "albums_items_parent_id_idx" ON "albums_items" USING btree ("_parent_id");
  CREATE INDEX "albums_items_media_idx" ON "albums_items" USING btree ("media_id");
  CREATE INDEX "albums_site_idx" ON "albums" USING btree ("site_id");
  CREATE INDEX "albums_publication_idx" ON "albums" USING btree ("publication_id");
  CREATE INDEX "albums_space_idx" ON "albums" USING btree ("space_id");
  CREATE INDEX "albums_owner_idx" ON "albums" USING btree ("owner_id");
  CREATE UNIQUE INDEX "albums_canonical_path_idx" ON "albums" USING btree ("canonical_path");
  CREATE INDEX "albums_cover_idx" ON "albums" USING btree ("cover_id");
  CREATE INDEX "albums_updated_at_idx" ON "albums" USING btree ("updated_at");
  CREATE INDEX "albums_created_at_idx" ON "albums" USING btree ("created_at");
  CREATE UNIQUE INDEX "publication_slug_1_idx" ON "albums" USING btree ("publication_id","slug");
  CREATE INDEX "media_usages_media_idx" ON "media_usages" USING btree ("media_id");
  CREATE UNIQUE INDEX "media_usages_usage_key_idx" ON "media_usages" USING btree ("usage_key");
  CREATE INDEX "media_usages_updated_at_idx" ON "media_usages" USING btree ("updated_at");
  CREATE INDEX "media_usages_created_at_idx" ON "media_usages" USING btree ("created_at");
  CREATE INDEX "media_usages_rels_order_idx" ON "media_usages_rels" USING btree ("order");
  CREATE INDEX "media_usages_rels_parent_idx" ON "media_usages_rels" USING btree ("parent_id");
  CREATE INDEX "media_usages_rels_path_idx" ON "media_usages_rels" USING btree ("path");
  CREATE INDEX "media_usages_rels_content_id_idx" ON "media_usages_rels" USING btree ("content_id");
  CREATE INDEX "media_usages_rels_albums_id_idx" ON "media_usages_rels" USING btree ("albums_id");
  CREATE INDEX "media_usages_rels_discussions_id_idx" ON "media_usages_rels" USING btree ("discussions_id");
  CREATE INDEX "media_usages_rels_discussion_posts_id_idx" ON "media_usages_rels" USING btree ("discussion_posts_id");
  CREATE INDEX "forum_sections_site_idx" ON "forum_sections" USING btree ("site_id");
  CREATE INDEX "forum_sections_publication_idx" ON "forum_sections" USING btree ("publication_id");
  CREATE INDEX "forum_sections_space_idx" ON "forum_sections" USING btree ("space_id");
  CREATE INDEX "forum_sections_updated_at_idx" ON "forum_sections" USING btree ("updated_at");
  CREATE INDEX "forum_sections_created_at_idx" ON "forum_sections" USING btree ("created_at");
  CREATE INDEX "forums_site_idx" ON "forums" USING btree ("site_id");
  CREATE INDEX "forums_publication_idx" ON "forums" USING btree ("publication_id");
  CREATE INDEX "forums_space_idx" ON "forums" USING btree ("space_id");
  CREATE INDEX "forums_section_idx" ON "forums" USING btree ("section_id");
  CREATE INDEX "forums_parent_idx" ON "forums" USING btree ("parent_id");
  CREATE INDEX "forums_updated_at_idx" ON "forums" USING btree ("updated_at");
  CREATE INDEX "forums_created_at_idx" ON "forums" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_parent_slug_idx" ON "forums" USING btree ("site_id","parent_id","slug");
  CREATE INDEX "discussions_site_idx" ON "discussions" USING btree ("site_id");
  CREATE INDEX "discussions_publication_idx" ON "discussions" USING btree ("publication_id");
  CREATE INDEX "discussions_space_idx" ON "discussions" USING btree ("space_id");
  CREATE INDEX "discussions_owner_idx" ON "discussions" USING btree ("owner_id");
  CREATE INDEX "discussions_forum_idx" ON "discussions" USING btree ("forum_id");
  CREATE INDEX "discussions_promoted_content_idx" ON "discussions" USING btree ("promoted_content_id");
  CREATE UNIQUE INDEX "discussions_canonical_path_idx" ON "discussions" USING btree ("canonical_path");
  CREATE INDEX "discussions_updated_at_idx" ON "discussions" USING btree ("updated_at");
  CREATE INDEX "discussions_created_at_idx" ON "discussions" USING btree ("created_at");
  CREATE INDEX "discussions_rels_order_idx" ON "discussions_rels" USING btree ("order");
  CREATE INDEX "discussions_rels_parent_idx" ON "discussions_rels" USING btree ("parent_id");
  CREATE INDEX "discussions_rels_path_idx" ON "discussions_rels" USING btree ("path");
  CREATE INDEX "discussions_rels_content_id_idx" ON "discussions_rels" USING btree ("content_id");
  CREATE INDEX "discussions_rels_media_assets_id_idx" ON "discussions_rels" USING btree ("media_assets_id");
  CREATE INDEX "discussions_rels_albums_id_idx" ON "discussions_rels" USING btree ("albums_id");
  CREATE INDEX "discussion_posts_discussion_idx" ON "discussion_posts" USING btree ("discussion_id");
  CREATE INDEX "discussion_posts_author_member_idx" ON "discussion_posts" USING btree ("author_member_id");
  CREATE INDEX "discussion_posts_author_guest_idx" ON "discussion_posts" USING btree ("author_guest_id");
  CREATE INDEX "discussion_posts_parent_idx" ON "discussion_posts" USING btree ("parent_id");
  CREATE INDEX "discussion_posts_quote_idx" ON "discussion_posts" USING btree ("quote_id");
  CREATE UNIQUE INDEX "discussion_posts_permalink_idx" ON "discussion_posts" USING btree ("permalink");
  CREATE INDEX "discussion_posts_updated_at_idx" ON "discussion_posts" USING btree ("updated_at");
  CREATE INDEX "discussion_posts_created_at_idx" ON "discussion_posts" USING btree ("created_at");
  CREATE INDEX "discussion_posts_rels_order_idx" ON "discussion_posts_rels" USING btree ("order");
  CREATE INDEX "discussion_posts_rels_parent_idx" ON "discussion_posts_rels" USING btree ("parent_id");
  CREATE INDEX "discussion_posts_rels_path_idx" ON "discussion_posts_rels" USING btree ("path");
  CREATE INDEX "discussion_posts_rels_media_assets_id_idx" ON "discussion_posts_rels" USING btree ("media_assets_id");
  CREATE INDEX "discussion_posts_rels_sources_id_idx" ON "discussion_posts_rels" USING btree ("sources_id");
  CREATE INDEX "calendar_entries_site_idx" ON "calendar_entries" USING btree ("site_id");
  CREATE INDEX "calendar_entries_publication_idx" ON "calendar_entries" USING btree ("publication_id");
  CREATE INDEX "calendar_entries_space_idx" ON "calendar_entries" USING btree ("space_id");
  CREATE INDEX "calendar_entries_owner_idx" ON "calendar_entries" USING btree ("owner_id");
  CREATE UNIQUE INDEX "calendar_entries_canonical_path_idx" ON "calendar_entries" USING btree ("canonical_path");
  CREATE INDEX "calendar_entries_updated_at_idx" ON "calendar_entries" USING btree ("updated_at");
  CREATE INDEX "calendar_entries_created_at_idx" ON "calendar_entries" USING btree ("created_at");
  CREATE INDEX "calendar_entries_rels_order_idx" ON "calendar_entries_rels" USING btree ("order");
  CREATE INDEX "calendar_entries_rels_parent_idx" ON "calendar_entries_rels" USING btree ("parent_id");
  CREATE INDEX "calendar_entries_rels_path_idx" ON "calendar_entries_rels" USING btree ("path");
  CREATE INDEX "calendar_entries_rels_content_id_idx" ON "calendar_entries_rels" USING btree ("content_id");
  CREATE INDEX "calendar_entries_rels_publications_id_idx" ON "calendar_entries_rels" USING btree ("publications_id");
  CREATE INDEX "calendar_entries_rels_media_assets_id_idx" ON "calendar_entries_rels" USING btree ("media_assets_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_brands_fk" FOREIGN KEY ("brands_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_profiles_fk" FOREIGN KEY ("profiles_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_spaces_fk" FOREIGN KEY ("spaces_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_relationships_fk" FOREIGN KEY ("relationships_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_series_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_taxonomy_redirects_fk" FOREIGN KEY ("taxonomy_redirects_id") REFERENCES "public"."taxonomy_redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_usages_fk" FOREIGN KEY ("media_usages_id") REFERENCES "public"."media_usages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_forum_sections_fk" FOREIGN KEY ("forum_sections_id") REFERENCES "public"."forum_sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_forums_fk" FOREIGN KEY ("forums_id") REFERENCES "public"."forums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussions_fk" FOREIGN KEY ("discussions_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussion_posts_fk" FOREIGN KEY ("discussion_posts_id") REFERENCES "public"."discussion_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_calendar_entries_fk" FOREIGN KEY ("calendar_entries_id") REFERENCES "public"."calendar_entries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_brands_id_idx" ON "payload_locked_documents_rels" USING btree ("brands_id");
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_locked_documents_rels_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("profiles_id");
  CREATE INDEX "payload_locked_documents_rels_spaces_id_idx" ON "payload_locked_documents_rels" USING btree ("spaces_id");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "payload_locked_documents_rels" USING btree ("authors_id");
  CREATE INDEX "payload_locked_documents_rels_publications_id_idx" ON "payload_locked_documents_rels" USING btree ("publications_id");
  CREATE INDEX "payload_locked_documents_rels_relationships_id_idx" ON "payload_locked_documents_rels" USING btree ("relationships_id");
  CREATE INDEX "payload_locked_documents_rels_media_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("media_assets_id");
  CREATE INDEX "payload_locked_documents_rels_sections_id_idx" ON "payload_locked_documents_rels" USING btree ("sections_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("topics_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_series_id_idx" ON "payload_locked_documents_rels" USING btree ("series_id");
  CREATE INDEX "payload_locked_documents_rels_taxonomy_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("taxonomy_redirects_id");
  CREATE INDEX "payload_locked_documents_rels_content_id_idx" ON "payload_locked_documents_rels" USING btree ("content_id");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_albums_id_idx" ON "payload_locked_documents_rels" USING btree ("albums_id");
  CREATE INDEX "payload_locked_documents_rels_media_usages_id_idx" ON "payload_locked_documents_rels" USING btree ("media_usages_id");
  CREATE INDEX "payload_locked_documents_rels_forum_sections_id_idx" ON "payload_locked_documents_rels" USING btree ("forum_sections_id");
  CREATE INDEX "payload_locked_documents_rels_forums_id_idx" ON "payload_locked_documents_rels" USING btree ("forums_id");
  CREATE INDEX "payload_locked_documents_rels_discussions_id_idx" ON "payload_locked_documents_rels" USING btree ("discussions_id");
  CREATE INDEX "payload_locked_documents_rels_discussion_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("discussion_posts_id");
  CREATE INDEX "payload_locked_documents_rels_calendar_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("calendar_entries_id");
  `)},down:async function a(a){throw Error("Refusing to roll back canonical_information_architecture automatically: the generated down migration would drop canonical content tables and reconstruct auth/session schema from an obsolete snapshot. Restore from backup or write a reviewed, environment-specific rollback instead.")},name:"20260813_054441_canonical_information_architecture"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "content"
      ADD COLUMN IF NOT EXISTS "seo_title" varchar,
      ADD COLUMN IF NOT EXISTS "seo_description" varchar,
      ADD COLUMN IF NOT EXISTS "seo_canonical_url" varchar,
      ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar,
      ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar,
      ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "structured_data_mode" varchar DEFAULT 'none' NOT NULL,
      ADD COLUMN IF NOT EXISTS "structured_data_primary_type" varchar,
      ADD COLUMN IF NOT EXISTS "structured_data_source_collection" varchar,
      ADD COLUMN IF NOT EXISTS "structured_data_source_identifier" varchar,
      ADD COLUMN IF NOT EXISTS "structured_data_manual" jsonb,
      ADD COLUMN IF NOT EXISTS "structured_data_version" numeric DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "knowledge_graph_projection_status" varchar DEFAULT 'disabled' NOT NULL,
      ADD COLUMN IF NOT EXISTS "knowledge_graph_node_key" varchar,
      ADD COLUMN IF NOT EXISTS "knowledge_graph_projection_boundary" jsonb,
      ADD COLUMN IF NOT EXISTS "import_source_system" varchar,
      ADD COLUMN IF NOT EXISTS "import_source_identifier" varchar,
      ADD COLUMN IF NOT EXISTS "import_source_checksum" varchar,
      ADD COLUMN IF NOT EXISTS "export_format_version" numeric DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "export_ownership" jsonb;

    CREATE TABLE IF NOT EXISTS "events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "owner_id" uuid,
      "title" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "canonical_path" varchar NOT NULL,
      "summary" varchar,
      "status" varchar DEFAULT 'draft' NOT NULL,
      "all_day" boolean DEFAULT false,
      "starts_at" timestamp(3) with time zone NOT NULL,
      "ends_at" timestamp(3) with time zone,
      "time_zone" varchar DEFAULT 'UTC' NOT NULL,
      "visibility" varchar DEFAULT 'public' NOT NULL,
      "venue_name" varchar,
      "venue_region" varchar,
      "attendance_mode" varchar DEFAULT 'in-person' NOT NULL,
      "hero_media_id" uuid,
      "calendar_entry_id" uuid,
      "audience" jsonb,
      "seo_title" varchar,
      "seo_description" varchar,
      "seo_canonical_url" varchar,
      "seo_image_alt" varchar,
      "seo_keywords" jsonb,
      "seo_focus_keyphrase" varchar,
      "seo_no_index" boolean DEFAULT false,
      "structured_data_mode" varchar DEFAULT 'none' NOT NULL,
      "structured_data_primary_type" varchar,
      "structured_data_source_collection" varchar,
      "structured_data_source_identifier" varchar,
      "structured_data_manual" jsonb,
      "structured_data_version" numeric DEFAULT 1,
      "knowledge_graph_projection_status" varchar DEFAULT 'disabled' NOT NULL,
      "knowledge_graph_node_key" varchar,
      "knowledge_graph_projection_boundary" jsonb,
      "import_source_system" varchar,
      "import_source_identifier" varchar,
      "import_source_checksum" varchar,
      "export_format_version" numeric DEFAULT 1,
      "export_ownership" jsonb,
      "public_render_strategy" varchar DEFAULT 'default' NOT NULL,
      "public_render_variant" varchar,
      "public_render_context" jsonb,
      "event_card_variant" varchar,
      "event_list_variant" varchar,
      "timeline_embed_variant" varchar,
      "timeline_block_variant" varchar,
      "retention_mode" varchar DEFAULT 'permanent' NOT NULL,
      "retention_expires_at" timestamp(3) with time zone,
      "retention_hold" varchar DEFAULT 'none' NOT NULL,
      "remove_from_discovery" boolean DEFAULT true,
      "tombstone_label" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "timelines" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "owner_id" uuid,
      "title" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "canonical_path" varchar NOT NULL,
      "summary" varchar,
      "status" varchar DEFAULT 'draft' NOT NULL,
      "visibility" varchar DEFAULT 'public' NOT NULL,
      "ordering_mode" varchar DEFAULT 'chronological' NOT NULL,
      "hero_media_id" uuid,
      "postgres_query_scope" jsonb,
      "seo_title" varchar,
      "seo_description" varchar,
      "seo_canonical_url" varchar,
      "seo_image_alt" varchar,
      "seo_keywords" jsonb,
      "seo_focus_keyphrase" varchar,
      "seo_no_index" boolean DEFAULT false,
      "structured_data_mode" varchar DEFAULT 'none' NOT NULL,
      "structured_data_primary_type" varchar,
      "structured_data_source_collection" varchar,
      "structured_data_source_identifier" varchar,
      "structured_data_manual" jsonb,
      "structured_data_version" numeric DEFAULT 1,
      "knowledge_graph_projection_status" varchar DEFAULT 'disabled' NOT NULL,
      "knowledge_graph_node_key" varchar,
      "knowledge_graph_projection_boundary" jsonb,
      "import_source_system" varchar,
      "import_source_identifier" varchar,
      "import_source_checksum" varchar,
      "export_format_version" numeric DEFAULT 1,
      "export_ownership" jsonb,
      "public_render_strategy" varchar DEFAULT 'default' NOT NULL,
      "public_render_variant" varchar,
      "public_render_context" jsonb,
      "event_card_variant" varchar,
      "event_list_variant" varchar,
      "timeline_embed_variant" varchar,
      "timeline_block_variant" varchar,
      "retention_mode" varchar DEFAULT 'permanent' NOT NULL,
      "retention_expires_at" timestamp(3) with time zone,
      "retention_hold" varchar DEFAULT 'none' NOT NULL,
      "remove_from_discovery" boolean DEFAULT true,
      "tombstone_label" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "timeline_memberships" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "timeline_id" uuid NOT NULL,
      "event_id" uuid NOT NULL,
      "membership_key" varchar NOT NULL,
      "display_title" varchar,
      "display_summary" varchar,
      "era_label" varchar,
      "position" numeric DEFAULT 0,
      "display_starts_at" timestamp(3) with time zone,
      "display_ends_at" timestamp(3) with time zone,
      "render_variant" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "calendar_entries"
      ADD COLUMN IF NOT EXISTS "event_id" uuid;

    ALTER TABLE "calendar_entries_rels"
      ADD COLUMN IF NOT EXISTS "events_id" uuid;

    ALTER TABLE "media_usages_rels"
      ADD COLUMN IF NOT EXISTS "events_id" uuid,
      ADD COLUMN IF NOT EXISTS "timelines_id" uuid;

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "events_id" uuid,
      ADD COLUMN IF NOT EXISTS "timelines_id" uuid,
      ADD COLUMN IF NOT EXISTS "timeline_memberships_id" uuid;

    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_hero_media_id_media_assets_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "events" ADD CONSTRAINT "events_calendar_entry_id_calendar_entries_id_fk" FOREIGN KEY ("calendar_entry_id") REFERENCES "public"."calendar_entries"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timelines" ADD CONSTRAINT "timelines_hero_media_id_media_assets_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "timeline_memberships" ADD CONSTRAINT "timeline_memberships_timeline_id_timelines_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "public"."timelines"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "timeline_memberships" ADD CONSTRAINT "timeline_memberships_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "calendar_entries_rels" ADD CONSTRAINT "calendar_entries_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_timelines_fk" FOREIGN KEY ("timelines_id") REFERENCES "public"."timelines"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_timelines_fk" FOREIGN KEY ("timelines_id") REFERENCES "public"."timelines"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_timeline_memberships_fk" FOREIGN KEY ("timeline_memberships_id") REFERENCES "public"."timeline_memberships"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS "events_canonical_path_idx" ON "events" USING btree ("canonical_path");
    CREATE UNIQUE INDEX IF NOT EXISTS "events_publication_slug_idx" ON "events" USING btree ("publication_id", "slug");
    CREATE INDEX IF NOT EXISTS "events_site_idx" ON "events" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "events_publication_idx" ON "events" USING btree ("publication_id");
    CREATE INDEX IF NOT EXISTS "events_space_idx" ON "events" USING btree ("space_id");
    CREATE INDEX IF NOT EXISTS "events_owner_idx" ON "events" USING btree ("owner_id");
    CREATE INDEX IF NOT EXISTS "events_calendar_entry_idx" ON "events" USING btree ("calendar_entry_id");
    CREATE INDEX IF NOT EXISTS "events_updated_at_idx" ON "events" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "events_created_at_idx" ON "events" USING btree ("created_at");

    CREATE UNIQUE INDEX IF NOT EXISTS "timelines_canonical_path_idx" ON "timelines" USING btree ("canonical_path");
    CREATE UNIQUE INDEX IF NOT EXISTS "timelines_publication_slug_idx" ON "timelines" USING btree ("publication_id", "slug");
    CREATE INDEX IF NOT EXISTS "timelines_site_idx" ON "timelines" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "timelines_publication_idx" ON "timelines" USING btree ("publication_id");
    CREATE INDEX IF NOT EXISTS "timelines_space_idx" ON "timelines" USING btree ("space_id");
    CREATE INDEX IF NOT EXISTS "timelines_owner_idx" ON "timelines" USING btree ("owner_id");
    CREATE INDEX IF NOT EXISTS "timelines_updated_at_idx" ON "timelines" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "timelines_created_at_idx" ON "timelines" USING btree ("created_at");

    CREATE UNIQUE INDEX IF NOT EXISTS "timeline_memberships_membership_key_idx" ON "timeline_memberships" USING btree ("membership_key");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_timeline_idx" ON "timeline_memberships" USING btree ("timeline_id");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_event_idx" ON "timeline_memberships" USING btree ("event_id");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_position_idx" ON "timeline_memberships" USING btree ("position");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_updated_at_idx" ON "timeline_memberships" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "timeline_memberships_created_at_idx" ON "timeline_memberships" USING btree ("created_at");

    CREATE INDEX IF NOT EXISTS "calendar_entries_event_idx" ON "calendar_entries" USING btree ("event_id");
    CREATE INDEX IF NOT EXISTS "calendar_entries_rels_events_id_idx" ON "calendar_entries_rels" USING btree ("events_id");
    CREATE INDEX IF NOT EXISTS "media_usages_rels_events_id_idx" ON "media_usages_rels" USING btree ("events_id");
    CREATE INDEX IF NOT EXISTS "media_usages_rels_timelines_id_idx" ON "media_usages_rels" USING btree ("timelines_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_timelines_id_idx" ON "payload_locked_documents_rels" USING btree ("timelines_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_timeline_memberships_id_idx" ON "payload_locked_documents_rels" USING btree ("timeline_memberships_id");
  `)},down:async function a(a){throw Error("Refusing to roll back event_timeline_reconciliation automatically: the migration is additive, but safe rollback requires a reviewed plan for seeded Event/Timeline data and retained relation records.")},name:"20260814_120000_m03_5_event_timeline_reconciliation"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE "site_settings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "owner_kind" varchar DEFAULT 'organization' NOT NULL,
      "organization_name" varchar,
      "person_name" varchar,
      "legal_name" varchar,
      "default_title" varchar NOT NULL,
      "default_description" varchar,
      "logo_id" uuid,
      "favicon_id" uuid,
      "default_social_image_id" uuid,
      "same_as" jsonb,
      "contact_defaults" jsonb,
      "social_handles" jsonb,
      "site_verification" jsonb,
      "robots_defaults" jsonb,
      "search_action_enabled" boolean DEFAULT false,
      "search_action_target_template" varchar DEFAULT '/search?q={search_term_string}',
      "organization_defaults" jsonb,
      "person_defaults" jsonb,
      "inheritance_policy" varchar DEFAULT 'site-publication-brand' NOT NULL,
      "seo_title" varchar,
      "seo_description" varchar,
      "seo_canonical_u_r_l" varchar,
      "seo_image_alt" varchar,
      "seo_keywords" jsonb,
      "seo_focus_keyphrase" varchar,
      "seo_no_index" boolean DEFAULT false,
      "structured_data_mode" varchar DEFAULT 'none' NOT NULL,
      "structured_data_primary_type" varchar,
      "structured_data_source_collection" varchar,
      "structured_data_source_identifier" varchar,
      "structured_data_manual" jsonb,
      "structured_data_version" numeric DEFAULT 1,
      "raw_structured_data_override" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `)},down:async function a({db:b}){await b.execute(aa.sql`DROP TABLE IF EXISTS "site_settings";`)},name:"20260818_000000_site_settings"},{up:async function a({db:b}){for(let a of ab)await b.execute(aa.sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${a}' AND column_name = 'seo_canonical_url'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${a}' AND column_name = 'seo_canonical_u_r_l'
        ) THEN
          ALTER TABLE "${a}" RENAME COLUMN "seo_canonical_url" TO "seo_canonical_u_r_l";
        END IF;
      END $$;
    `))},down:async function a({db:b}){for(let a of ab)await b.execute(aa.sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${a}' AND column_name = 'seo_canonical_u_r_l'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${a}' AND column_name = 'seo_canonical_url'
        ) THEN
          ALTER TABLE "${a}" RENAME COLUMN "seo_canonical_u_r_l" TO "seo_canonical_url";
        END IF;
      END $$;
    `))},name:"20260818_010000_reconcile_seo_canonical_columns"},{up:async function a({db:b}){await b.execute(aa.sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_content_public_change_history_policy" AS ENUM('hidden', 'summary', 'full');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_preview_modes" AS ENUM('desktop', 'mobile');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_permissions_actions" AS ENUM('read', 'edit', 'request-review', 'review', 'approve', 'schedule', 'publish');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_source_references_public_visibility" AS ENUM('public', 'staff');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_citation_attachments_role" AS ENUM('excerpt', 'scan', 'transcript', 'supporting-document');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_article_family_content_lifecycle" AS ENUM('draft', 'review', 'approved', 'scheduled', 'published', 'updated', 'archived', 'rejected');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_markdown_conversion_reports_status" AS ENUM('accepted', 'accepted-with-warnings', 'rejected');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_revision_records_reason" AS ENUM('created', 'edited', 'reviewed', 'published', 'restored', 'imported');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_preview_tokens_scope" AS ENUM('article-preview');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_scheduled_publish_jobs_status" AS ENUM('pending-contract', 'queued', 'completed', 'cancelled', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TYPE "public"."enum_content_status" ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE "public"."enum_content_status" ADD VALUE IF NOT EXISTS 'updated';
    ALTER TYPE "public"."enum_content_status" ADD VALUE IF NOT EXISTS 'rejected';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'editorial-publish';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'editorial-publish';

    CREATE TABLE IF NOT EXISTS "content_correction_notices" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL,
      "detail" varchar NOT NULL,
      "issued_at" timestamp(3) with time zone NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "content_change_notes" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "summary" varchar NOT NULL,
      "issued_at" timestamp(3) with time zone NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "content_id" uuid NOT NULL,
      "article_key" varchar NOT NULL,
      "lifecycle" "enum_article_family_content_lifecycle" DEFAULT 'draft' NOT NULL,
      "document" jsonb NOT NULL,
      "document_hash" varchar NOT NULL,
      "plain_text_projection" varchar NOT NULL,
      "current_revision_sequence" numeric DEFAULT 1 NOT NULL,
      "current_revision_id" uuid,
      "latest_published_revision_id" uuid,
      "first_published_at" timestamp(3) with time zone,
      "last_previewed_at" timestamp(3) with time zone,
      "bibliography" jsonb,
      "workflow_audit" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "accepted_mutation_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "revision_comparison" jsonb,
      "promotion_provenance" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_preview_modes" (
      "order" integer NOT NULL,
      "parent_id" uuid NOT NULL,
      "value" "enum_article_family_content_preview_modes",
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_permissions" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "user_id" uuid NOT NULL,
      "granted_at" timestamp(3) with time zone NOT NULL,
      "expires_at" timestamp(3) with time zone
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_permissions_actions" (
      "order" integer NOT NULL,
      "parent_id" varchar NOT NULL,
      "value" "enum_article_family_content_permissions_actions",
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_source_references" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "source_reference_id" varchar NOT NULL,
      "source_id" uuid NOT NULL,
      "locator" varchar,
      "bibliography_key" varchar NOT NULL,
      "public_visibility" "enum_article_family_content_source_references_public_visibility" DEFAULT 'public' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_citations" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "citation_id" varchar NOT NULL,
      "source_reference_id" varchar NOT NULL,
      "node_key" varchar NOT NULL,
      "offset_start" numeric NOT NULL,
      "offset_end" numeric NOT NULL,
      "ordinal" numeric NOT NULL,
      "passage_checksum" varchar
    );

    CREATE TABLE IF NOT EXISTS "article_family_content_citation_attachments" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "citation_id" varchar NOT NULL,
      "media_id" uuid NOT NULL,
      "role" "enum_article_family_content_citation_attachments_role" NOT NULL,
      "checksum" varchar NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "markdown_conversion_reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "article_id" uuid,
      "source_checksum" varchar NOT NULL,
      "target_document_hash" varchar,
      "format_version" numeric DEFAULT 1 NOT NULL,
      "status" "enum_markdown_conversion_reports_status" NOT NULL,
      "fidelity_boundary" jsonb NOT NULL,
      "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "unsupported_constructs" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "revision_records" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "article_id" uuid NOT NULL,
      "parent_revision_id" uuid,
      "restored_from_revision_id" uuid,
      "sequence" numeric NOT NULL,
      "document" jsonb NOT NULL,
      "document_hash" varchar NOT NULL,
      "integrity_hash" varchar NOT NULL,
      "reason" "enum_revision_records_reason" NOT NULL,
      "immutable" boolean DEFAULT true NOT NULL,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "preview_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "article_id" uuid NOT NULL,
      "revision_id" uuid,
      "token_hash" varchar NOT NULL,
      "scope" "enum_preview_tokens_scope" DEFAULT 'article-preview' NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "revoked_at" timestamp(3) with time zone,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "scheduled_publish_jobs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "article_id" uuid NOT NULL,
      "job_id" uuid,
      "revision_id" uuid NOT NULL,
      "scheduled_for" timestamp(3) with time zone NOT NULL,
      "time_zone" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "status" "enum_scheduled_publish_jobs_status" DEFAULT 'pending-contract' NOT NULL,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "content"
      ADD COLUMN IF NOT EXISTS "subtitle" varchar,
      ADD COLUMN IF NOT EXISTS "excerpt" varchar,
      ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "pinned" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "reading_time_minutes" numeric,
      ADD COLUMN IF NOT EXISTS "table_of_contents" jsonb,
      ADD COLUMN IF NOT EXISTS "public_change_history_policy" "enum_content_public_change_history_policy" DEFAULT 'summary' NOT NULL;

    ALTER TABLE "content_rels"
      ADD COLUMN IF NOT EXISTS "content_id" uuid;

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "article_family_content_id" uuid,
      ADD COLUMN IF NOT EXISTS "markdown_conversion_reports_id" uuid,
      ADD COLUMN IF NOT EXISTS "revision_records_id" uuid,
      ADD COLUMN IF NOT EXISTS "preview_tokens_id" uuid,
      ADD COLUMN IF NOT EXISTS "scheduled_publish_jobs_id" uuid;

    DO $$ BEGIN
      ALTER TABLE "content_correction_notices" ADD CONSTRAINT "content_correction_notices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "content_change_notes" ADD CONSTRAINT "content_change_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_preview_modes" ADD CONSTRAINT "article_family_content_preview_modes_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_permissions" ADD CONSTRAINT "article_family_content_permissions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_permissions" ADD CONSTRAINT "article_family_content_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_permissions_actions" ADD CONSTRAINT "article_family_content_permissions_actions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."article_family_content_permissions"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_source_references" ADD CONSTRAINT "article_family_content_source_references_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_source_references" ADD CONSTRAINT "article_family_content_source_references_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_citations" ADD CONSTRAINT "article_family_content_citations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_citation_attachments" ADD CONSTRAINT "article_family_content_citation_attachments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content_citation_attachments" ADD CONSTRAINT "article_family_content_citation_attachments_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content" ADD CONSTRAINT "article_family_content_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "revision_records" ADD CONSTRAINT "revision_records_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "revision_records" ADD CONSTRAINT "revision_records_parent_revision_id_revision_records_id_fk" FOREIGN KEY ("parent_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "revision_records" ADD CONSTRAINT "revision_records_restored_from_revision_id_revision_records_id_fk" FOREIGN KEY ("restored_from_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "revision_records" ADD CONSTRAINT "revision_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content" ADD CONSTRAINT "article_family_content_current_revision_id_revision_records_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "article_family_content" ADD CONSTRAINT "article_family_content_latest_published_revision_id_revision_records_id_fk" FOREIGN KEY ("latest_published_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "markdown_conversion_reports" ADD CONSTRAINT "markdown_conversion_reports_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "markdown_conversion_reports" ADD CONSTRAINT "markdown_conversion_reports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "preview_tokens" ADD CONSTRAINT "preview_tokens_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "preview_tokens" ADD CONSTRAINT "preview_tokens_revision_id_revision_records_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "preview_tokens" ADD CONSTRAINT "preview_tokens_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "scheduled_publish_jobs" ADD CONSTRAINT "scheduled_publish_jobs_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "scheduled_publish_jobs" ADD CONSTRAINT "scheduled_publish_jobs_job_id_payload_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "scheduled_publish_jobs" ADD CONSTRAINT "scheduled_publish_jobs_revision_id_revision_records_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "scheduled_publish_jobs" ADD CONSTRAINT "scheduled_publish_jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "content_rels" ADD CONSTRAINT "content_rels_content_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_article_family_content_fk" FOREIGN KEY ("article_family_content_id") REFERENCES "public"."article_family_content"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_markdown_conversion_reports_fk" FOREIGN KEY ("markdown_conversion_reports_id") REFERENCES "public"."markdown_conversion_reports"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_revision_records_fk" FOREIGN KEY ("revision_records_id") REFERENCES "public"."revision_records"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_preview_tokens_fk" FOREIGN KEY ("preview_tokens_id") REFERENCES "public"."preview_tokens"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scheduled_publish_jobs_fk" FOREIGN KEY ("scheduled_publish_jobs_id") REFERENCES "public"."scheduled_publish_jobs"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE INDEX IF NOT EXISTS "content_correction_notices_order_idx" ON "content_correction_notices" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "content_correction_notices_parent_id_idx" ON "content_correction_notices" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "content_change_notes_order_idx" ON "content_change_notes" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "content_change_notes_parent_id_idx" ON "content_change_notes" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_preview_modes_order_idx" ON "article_family_content_preview_modes" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "article_family_content_preview_modes_parent_idx" ON "article_family_content_preview_modes" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_order_idx" ON "article_family_content_permissions" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_parent_id_idx" ON "article_family_content_permissions" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_user_idx" ON "article_family_content_permissions" USING btree ("user_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_actions_order_idx" ON "article_family_content_permissions_actions" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "article_family_content_permissions_actions_parent_idx" ON "article_family_content_permissions_actions" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_source_references_order_idx" ON "article_family_content_source_references" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "article_family_content_source_references_parent_id_idx" ON "article_family_content_source_references" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_source_references_source_idx" ON "article_family_content_source_references" USING btree ("source_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_citations_order_idx" ON "article_family_content_citations" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "article_family_content_citations_parent_id_idx" ON "article_family_content_citations" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_citation_attachments_order_idx" ON "article_family_content_citation_attachments" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "article_family_content_citation_attachments_parent_id_idx" ON "article_family_content_citation_attachments" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_citation_attachments_media_idx" ON "article_family_content_citation_attachments" USING btree ("media_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "article_family_content_content_idx" ON "article_family_content" USING btree ("content_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "article_family_content_article_key_idx" ON "article_family_content" USING btree ("article_key");
    CREATE INDEX IF NOT EXISTS "article_family_content_current_revision_idx" ON "article_family_content" USING btree ("current_revision_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_latest_published_revision_idx" ON "article_family_content" USING btree ("latest_published_revision_id");
    CREATE INDEX IF NOT EXISTS "article_family_content_updated_at_idx" ON "article_family_content" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "article_family_content_created_at_idx" ON "article_family_content" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_article_idx" ON "markdown_conversion_reports" USING btree ("article_id");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_source_checksum_idx" ON "markdown_conversion_reports" USING btree ("source_checksum");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_created_by_idx" ON "markdown_conversion_reports" USING btree ("created_by_id");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_updated_at_idx" ON "markdown_conversion_reports" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "markdown_conversion_reports_created_at_idx" ON "markdown_conversion_reports" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "revision_records_article_idx" ON "revision_records" USING btree ("article_id");
    CREATE INDEX IF NOT EXISTS "revision_records_parent_revision_idx" ON "revision_records" USING btree ("parent_revision_id");
    CREATE INDEX IF NOT EXISTS "revision_records_restored_from_revision_idx" ON "revision_records" USING btree ("restored_from_revision_id");
    CREATE INDEX IF NOT EXISTS "revision_records_created_by_idx" ON "revision_records" USING btree ("created_by_id");
    CREATE INDEX IF NOT EXISTS "revision_records_updated_at_idx" ON "revision_records" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "revision_records_created_at_idx" ON "revision_records" USING btree ("created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "article_sequence_idx" ON "revision_records" USING btree ("article_id", "sequence");
    CREATE INDEX IF NOT EXISTS "preview_tokens_article_idx" ON "preview_tokens" USING btree ("article_id");
    CREATE INDEX IF NOT EXISTS "preview_tokens_revision_idx" ON "preview_tokens" USING btree ("revision_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "preview_tokens_token_hash_idx" ON "preview_tokens" USING btree ("token_hash");
    CREATE INDEX IF NOT EXISTS "preview_tokens_created_by_idx" ON "preview_tokens" USING btree ("created_by_id");
    CREATE INDEX IF NOT EXISTS "preview_tokens_updated_at_idx" ON "preview_tokens" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "preview_tokens_created_at_idx" ON "preview_tokens" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_article_idx" ON "scheduled_publish_jobs" USING btree ("article_id");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_job_idx" ON "scheduled_publish_jobs" USING btree ("job_id");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_revision_idx" ON "scheduled_publish_jobs" USING btree ("revision_id");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_scheduled_for_idx" ON "scheduled_publish_jobs" USING btree ("scheduled_for");
    CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_publish_jobs_idempotency_key_idx" ON "scheduled_publish_jobs" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_created_by_idx" ON "scheduled_publish_jobs" USING btree ("created_by_id");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_updated_at_idx" ON "scheduled_publish_jobs" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "scheduled_publish_jobs_created_at_idx" ON "scheduled_publish_jobs" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "content_rels_content_id_idx" ON "content_rels" USING btree ("content_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_article_family_content_id_idx" ON "payload_locked_documents_rels" USING btree ("article_family_content_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_markdown_conversion_report_idx" ON "payload_locked_documents_rels" USING btree ("markdown_conversion_reports_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_revision_records_id_idx" ON "payload_locked_documents_rels" USING btree ("revision_records_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_preview_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("preview_tokens_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_scheduled_publish_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("scheduled_publish_jobs_id");
  `)},down:async function a(a){throw Error("20260818_062327_m04_c_editorial_workflow is additive and owned by editorial.m04; rollback requires reviewed manual data migration.")},name:"20260818_062327_m04_c_editorial_workflow"},{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   CREATE TYPE "public"."enum_page_layouts_theme_id" AS ENUM('neutral-starter', 'renegade-party');
  CREATE TYPE "public"."enum_page_layouts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_page_layouts_visibility" AS ENUM('public', 'unlisted', 'members', 'friends', 'private');
  CREATE TYPE "public"."enum_page_layouts_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  CREATE TYPE "public"."enum_page_layouts_retention_hold" AS ENUM('none', 'legal', 'moderation');
  CREATE TABLE "page_layouts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"path" varchar NOT NULL,
  	"theme_id" "enum_page_layouts_theme_id" DEFAULT 'neutral-starter' NOT NULL,
  	"layout_version" numeric DEFAULT 1 NOT NULL,
  	"status" "enum_page_layouts_status" DEFAULT 'draft' NOT NULL,
  	"visibility" "enum_page_layouts_visibility" DEFAULT 'public' NOT NULL,
  	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"unknown_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"published_revision" numeric,
  	"revision_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"retention_mode" "enum_page_layouts_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_page_layouts_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "page_layouts_id" uuid;
  ALTER TABLE "page_layouts" ADD CONSTRAINT "page_layouts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_layouts" ADD CONSTRAINT "page_layouts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_layouts" ADD CONSTRAINT "page_layouts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "page_layouts_site_idx" ON "page_layouts" USING btree ("site_id");
  CREATE INDEX "page_layouts_publication_idx" ON "page_layouts" USING btree ("publication_id");
  CREATE INDEX "page_layouts_space_idx" ON "page_layouts" USING btree ("space_id");
  CREATE INDEX "page_layouts_path_idx" ON "page_layouts" USING btree ("path");
  CREATE INDEX "page_layouts_updated_at_idx" ON "page_layouts" USING btree ("updated_at");
  CREATE INDEX "page_layouts_created_at_idx" ON "page_layouts" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_path_idx" ON "page_layouts" USING btree ("site_id","path");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_page_layouts_fk" FOREIGN KEY ("page_layouts_id") REFERENCES "public"."page_layouts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_page_layouts_id_idx" ON "payload_locked_documents_rels" USING btree ("page_layouts_id");`)},down:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   ALTER TABLE "page_layouts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "page_layouts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_page_layouts_fk";
  
  DROP INDEX "payload_locked_documents_rels_page_layouts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "page_layouts_id";
  DROP TYPE "public"."enum_page_layouts_theme_id";
  DROP TYPE "public"."enum_page_layouts_status";
  DROP TYPE "public"."enum_page_layouts_visibility";
  DROP TYPE "public"."enum_page_layouts_retention_mode";
  DROP TYPE "public"."enum_page_layouts_retention_hold";`)},name:"20260822_010232_page_layouts"},{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   CREATE TYPE "public"."enum_linked_identities_kind" AS ENUM('passkey', 'oauth', 'social', 'wallet', 'email-magic-link');
  CREATE TYPE "public"."enum_member_sessions_created_from" AS ENUM('magic-link', 'passkey', 'oauth', 'wallet', 'recovery');
  CREATE TYPE "public"."enum_identity_tokens_purpose" AS ENUM('magic-link-sign-in', 'identity-link', 'wallet-nonce');
  CREATE TABLE "linked_identities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"kind" "enum_linked_identities_kind" NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"external_subject" varchar NOT NULL,
  	"verified_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_sessions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"revoked_at" timestamp(3) with time zone,
  	"last_seen_at" timestamp(3) with time zone,
  	"device_label" varchar,
  	"created_from" "enum_member_sessions_created_from" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "identity_tokens" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"purpose" "enum_identity_tokens_purpose" NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"email_hash" varchar,
  	"member_id" uuid,
  	"browser_binding_hash" varchar,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"consumed_at" timestamp(3) with time zone,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_recovery_codes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"code_hash" varchar NOT NULL,
  	"used_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "identity_audit_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid,
  	"event" varchar NOT NULL,
  	"details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "members" ADD COLUMN "deletion_requested_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "verified_email_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "linked_identities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_sessions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "identity_tokens_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_recovery_codes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "identity_audit_events_id" uuid;
  ALTER TABLE "linked_identities" ADD CONSTRAINT "linked_identities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "identity_tokens" ADD CONSTRAINT "identity_tokens_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "member_recovery_codes" ADD CONSTRAINT "member_recovery_codes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "identity_audit_events" ADD CONSTRAINT "identity_audit_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "linked_identities_member_idx" ON "linked_identities" USING btree ("member_id");
  CREATE INDEX "linked_identities_provider_key_idx" ON "linked_identities" USING btree ("provider_key");
  CREATE INDEX "linked_identities_external_subject_idx" ON "linked_identities" USING btree ("external_subject");
  CREATE INDEX "linked_identities_updated_at_idx" ON "linked_identities" USING btree ("updated_at");
  CREATE INDEX "linked_identities_created_at_idx" ON "linked_identities" USING btree ("created_at");
  CREATE UNIQUE INDEX "providerKey_externalSubject_idx" ON "linked_identities" USING btree ("provider_key","external_subject");
  CREATE INDEX "member_sessions_member_idx" ON "member_sessions" USING btree ("member_id");
  CREATE UNIQUE INDEX "member_sessions_token_hash_idx" ON "member_sessions" USING btree ("token_hash");
  CREATE INDEX "member_sessions_expires_at_idx" ON "member_sessions" USING btree ("expires_at");
  CREATE INDEX "member_sessions_updated_at_idx" ON "member_sessions" USING btree ("updated_at");
  CREATE INDEX "member_sessions_created_at_idx" ON "member_sessions" USING btree ("created_at");
  CREATE UNIQUE INDEX "identity_tokens_token_hash_idx" ON "identity_tokens" USING btree ("token_hash");
  CREATE INDEX "identity_tokens_email_hash_idx" ON "identity_tokens" USING btree ("email_hash");
  CREATE INDEX "identity_tokens_member_idx" ON "identity_tokens" USING btree ("member_id");
  CREATE INDEX "identity_tokens_expires_at_idx" ON "identity_tokens" USING btree ("expires_at");
  CREATE INDEX "identity_tokens_updated_at_idx" ON "identity_tokens" USING btree ("updated_at");
  CREATE INDEX "identity_tokens_created_at_idx" ON "identity_tokens" USING btree ("created_at");
  CREATE INDEX "member_recovery_codes_member_idx" ON "member_recovery_codes" USING btree ("member_id");
  CREATE UNIQUE INDEX "member_recovery_codes_code_hash_idx" ON "member_recovery_codes" USING btree ("code_hash");
  CREATE INDEX "member_recovery_codes_updated_at_idx" ON "member_recovery_codes" USING btree ("updated_at");
  CREATE INDEX "member_recovery_codes_created_at_idx" ON "member_recovery_codes" USING btree ("created_at");
  CREATE INDEX "identity_audit_events_member_idx" ON "identity_audit_events" USING btree ("member_id");
  CREATE INDEX "identity_audit_events_event_idx" ON "identity_audit_events" USING btree ("event");
  CREATE INDEX "identity_audit_events_updated_at_idx" ON "identity_audit_events" USING btree ("updated_at");
  CREATE INDEX "identity_audit_events_created_at_idx" ON "identity_audit_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_linked_identities_fk" FOREIGN KEY ("linked_identities_id") REFERENCES "public"."linked_identities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_sessions_fk" FOREIGN KEY ("member_sessions_id") REFERENCES "public"."member_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_identity_tokens_fk" FOREIGN KEY ("identity_tokens_id") REFERENCES "public"."identity_tokens"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_recovery_codes_fk" FOREIGN KEY ("member_recovery_codes_id") REFERENCES "public"."member_recovery_codes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_identity_audit_events_fk" FOREIGN KEY ("identity_audit_events_id") REFERENCES "public"."identity_audit_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_linked_identities_id_idx" ON "payload_locked_documents_rels" USING btree ("linked_identities_id");
  CREATE INDEX "payload_locked_documents_rels_member_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("member_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_identity_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("identity_tokens_id");
  CREATE INDEX "payload_locked_documents_rels_member_recovery_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("member_recovery_codes_id");
  CREATE INDEX "payload_locked_documents_rels_identity_audit_events_id_idx" ON "payload_locked_documents_rels" USING btree ("identity_audit_events_id");`)},down:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   ALTER TABLE "linked_identities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "member_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "identity_tokens" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "member_recovery_codes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "identity_audit_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "linked_identities" CASCADE;
  DROP TABLE "member_sessions" CASCADE;
  DROP TABLE "identity_tokens" CASCADE;
  DROP TABLE "member_recovery_codes" CASCADE;
  DROP TABLE "identity_audit_events" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_linked_identities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_member_sessions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_identity_tokens_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_member_recovery_codes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_identity_audit_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_linked_identities_id_idx";
  DROP INDEX "payload_locked_documents_rels_member_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_identity_tokens_id_idx";
  DROP INDEX "payload_locked_documents_rels_member_recovery_codes_id_idx";
  DROP INDEX "payload_locked_documents_rels_identity_audit_events_id_idx";
  ALTER TABLE "members" DROP COLUMN "deletion_requested_at";
  ALTER TABLE "members" DROP COLUMN "verified_email_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "linked_identities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "identity_tokens_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_recovery_codes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "identity_audit_events_id";
  DROP TYPE "public"."enum_linked_identities_kind";
  DROP TYPE "public"."enum_member_sessions_created_from";
  DROP TYPE "public"."enum_identity_tokens_purpose";`)},name:"20260822_012313_m07_a_passwordless_identity"},{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   CREATE TYPE "public"."enum_books_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_books_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_book_editions_format" AS ENUM('hardcover', 'paperback', 'ebook', 'audiobook');
  CREATE TYPE "public"."enum_podcast_shows_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_podcast_shows_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_podcast_episodes_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_podcast_episodes_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_video_channels_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_video_channels_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_video_playlists_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_video_playlists_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_videos_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_videos_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_interviews_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_interviews_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_livestreams_structured_data_mode" AS ENUM('none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived');
  CREATE TYPE "public"."enum_livestreams_structured_data_source_collection" AS ENUM('content', 'events', 'timelines', 'sources', 'calendar-entries');
  CREATE TYPE "public"."enum_transcript_revisions_source" AS ENUM('provider', 'manual', 'ai-cleanup');
  CREATE TYPE "public"."enum_media_jobs_kind" AS ENUM('upload', 'import', 'derivative', 'transcribe', 'tts', 'publisher-read');
  CREATE TYPE "public"."enum_media_jobs_status" AS ENUM('queued', 'running', 'cancelled', 'retrying', 'failed', 'completed');
  CREATE TYPE "public"."enum_tts_outputs_mode" AS ENUM('tts', 'publisher-read');
  CREATE TYPE "public"."enum_tts_outputs_status" AS ENUM('processing', 'ready', 'failed');
  CREATE TYPE "public"."enum_media_derivatives_preset" AS ENUM('hero', 'og', 'square', 'portrait', 'story', 'newsletter', 'thumbnail');
  CREATE TYPE "public"."enum_media_derivatives_status" AS ENUM('pending', 'approved', 'superseded', 'failed');
  CREATE TYPE "public"."enum_edit_sessions_status" AS ENUM('active', 'cancelled', 'committed');
  CREATE TYPE "public"."enum_quick_capture_drafts_offline_state" AS ENUM('queued', 'synced', 'conflict');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'media-import';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'media-render';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'media-transcribe';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'media-tts';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'media-import';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'media-render';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'media-transcribe';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'media-tts';
  CREATE TABLE "books" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_books_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_books_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"isbn" varchar,
  	"purchase_links" jsonb,
  	"download_links" jsonb,
  	"cover_id" uuid,
  	"serialized_release" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "books_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_assets_id" uuid
  );
  
  CREATE TABLE "book_parts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"book_id" uuid NOT NULL,
  	"title" varchar NOT NULL,
  	"display_order" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "book_chapters" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"book_id" uuid NOT NULL,
  	"part_id" uuid,
  	"content_id" uuid,
  	"title" varchar NOT NULL,
  	"display_order" numeric NOT NULL,
  	"release_at" timestamp(3) with time zone,
  	"preview" boolean DEFAULT false,
  	"footnotes" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "book_editions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"book_id" uuid NOT NULL,
  	"title" varchar NOT NULL,
  	"isbn" varchar,
  	"format" "enum_book_editions_format",
  	"published_at" timestamp(3) with time zone,
  	"download_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "podcast_shows" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_podcast_shows_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_podcast_shows_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"rss_enabled" boolean DEFAULT false,
  	"external_feed_url" varchar,
  	"artwork_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "podcast_shows_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" uuid
  );
  
  CREATE TABLE "podcast_seasons" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"show_id" uuid NOT NULL,
  	"title" varchar NOT NULL,
  	"number" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "podcast_episodes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_podcast_episodes_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_podcast_episodes_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"show_id" uuid NOT NULL,
  	"season_id" uuid,
  	"audio_id" uuid,
  	"external_url" varchar,
  	"provider_identity" varchar,
  	"episode_number" numeric,
  	"show_notes" jsonb,
  	"chapters" jsonb,
  	"transcript_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "podcast_episodes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" uuid
  );
  
  CREATE TABLE "video_channels" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_video_channels_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_video_channels_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"provider" varchar NOT NULL,
  	"external_id" varchar NOT NULL,
  	"last_synced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "video_playlists" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_video_playlists_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_video_playlists_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"channel_id" uuid NOT NULL,
  	"external_id" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "videos" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_videos_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_videos_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"channel_id" uuid,
  	"playlist_id" uuid,
  	"provider" varchar NOT NULL,
  	"external_id" varchar NOT NULL,
  	"embed_url" varchar,
  	"thumbnail_id" uuid,
  	"transcript_id" uuid,
  	"chapters" jsonb,
  	"derives_from_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "interviews" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_interviews_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_interviews_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"media_id" uuid,
  	"transcript_id" uuid,
  	"quotes" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "interviews_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" uuid,
  	"sources_id" uuid
  );
  
  CREATE TABLE "livestreams" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"content_id" uuid,
  	"canonical_path" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical_u_r_l" varchar,
  	"seo_image_alt" varchar,
  	"seo_keywords" jsonb,
  	"seo_focus_keyphrase" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"structured_data_mode" "enum_livestreams_structured_data_mode" DEFAULT 'none' NOT NULL,
  	"structured_data_primary_type" varchar,
  	"structured_data_source_collection" "enum_livestreams_structured_data_source_collection",
  	"structured_data_source_identifier" varchar,
  	"structured_data_manual" jsonb,
  	"structured_data_version" numeric DEFAULT 1,
  	"starts_at" timestamp(3) with time zone,
  	"embed_url" varchar,
  	"reminder_hook" jsonb,
  	"replay_id" uuid,
  	"transcript_id" uuid,
  	"campaign_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "transcript_revisions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"media_id" uuid NOT NULL,
  	"version" numeric NOT NULL,
  	"source" "enum_transcript_revisions_source" NOT NULL,
  	"source_revision_id" uuid,
  	"segments" jsonb NOT NULL,
  	"checksum" varchar NOT NULL,
  	"immutable" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_jobs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "enum_media_jobs_kind" NOT NULL,
  	"status" "enum_media_jobs_status" DEFAULT 'queued' NOT NULL,
  	"progress" numeric DEFAULT 0,
  	"idempotency_key" varchar NOT NULL,
  	"failure" jsonb,
  	"input" jsonb,
  	"output" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tts_outputs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"content_id" uuid NOT NULL,
  	"source_revision_id" uuid,
  	"mode" "enum_tts_outputs_mode" NOT NULL,
  	"audio_id" uuid,
  	"voice_settings" jsonb,
  	"licensed_output_metadata" jsonb,
  	"status" "enum_tts_outputs_status" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "graphic_documents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"source_media_id" uuid NOT NULL,
  	"source_revision" varchar NOT NULL,
  	"layers" jsonb NOT NULL,
  	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"brand_kit_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media_derivatives" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"document_id" uuid NOT NULL,
  	"source_media_id" uuid NOT NULL,
  	"asset_id" uuid,
  	"preset" "enum_media_derivatives_preset",
  	"recipe" jsonb NOT NULL,
  	"status" "enum_media_derivatives_status" DEFAULT 'pending',
  	"usage_references" jsonb DEFAULT '[]'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "edit_sessions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"document_id" uuid NOT NULL,
  	"status" "enum_edit_sessions_status" DEFAULT 'active',
  	"client_mutation_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quick_capture_drafts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"content_id" uuid,
  	"client_mutation_id" varchar NOT NULL,
  	"offline_state" "enum_quick_capture_drafts_offline_state" DEFAULT 'queued',
  	"requested_review_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quick_capture_drafts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_assets_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "books_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "book_parts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "book_chapters_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "book_editions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "podcast_shows_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "podcast_seasons_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "podcast_episodes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "video_channels_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "video_playlists_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "videos_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "interviews_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "livestreams_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "transcript_revisions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_jobs_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tts_outputs_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "graphic_documents_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_derivatives_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "edit_sessions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quick_capture_drafts_id" uuid;
  ALTER TABLE "books" ADD CONSTRAINT "books_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books_rels" ADD CONSTRAINT "books_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "books_rels" ADD CONSTRAINT "books_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "book_parts" ADD CONSTRAINT "book_parts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_chapters" ADD CONSTRAINT "book_chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_chapters" ADD CONSTRAINT "book_chapters_part_id_book_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."book_parts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_chapters" ADD CONSTRAINT "book_chapters_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_download_id_media_assets_id_fk" FOREIGN KEY ("download_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_artwork_id_media_assets_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_shows_rels" ADD CONSTRAINT "podcast_shows_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcast_shows_rels" ADD CONSTRAINT "podcast_shows_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcast_seasons" ADD CONSTRAINT "podcast_seasons_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_season_id_podcast_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."podcast_seasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_audio_id_media_assets_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_transcript_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcast_episodes_rels" ADD CONSTRAINT "podcast_episodes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcast_episodes_rels" ADD CONSTRAINT "podcast_episodes_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "video_playlists" ADD CONSTRAINT "video_playlists_channel_id_video_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."video_channels"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_channel_id_video_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."video_channels"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_playlist_id_video_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."video_playlists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_thumbnail_id_media_assets_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_transcript_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_derives_from_id_videos_id_fk" FOREIGN KEY ("derives_from_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews" ADD CONSTRAINT "interviews_transcript_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interviews_rels" ADD CONSTRAINT "interviews_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "interviews_rels" ADD CONSTRAINT "interviews_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "interviews_rels" ADD CONSTRAINT "interviews_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_replay_id_videos_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_transcript_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "livestreams" ADD CONSTRAINT "livestreams_campaign_id_content_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_source_revision_id_transcript_revisions_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tts_outputs" ADD CONSTRAINT "tts_outputs_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tts_outputs" ADD CONSTRAINT "tts_outputs_source_revision_id_revision_records_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tts_outputs" ADD CONSTRAINT "tts_outputs_audio_id_media_assets_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_source_media_id_media_assets_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_brand_kit_id_brands_id_fk" FOREIGN KEY ("brand_kit_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_document_id_graphic_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."graphic_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_source_media_id_media_assets_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "edit_sessions" ADD CONSTRAINT "edit_sessions_document_id_graphic_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."graphic_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quick_capture_drafts" ADD CONSTRAINT "quick_capture_drafts_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quick_capture_drafts_rels" ADD CONSTRAINT "quick_capture_drafts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."quick_capture_drafts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quick_capture_drafts_rels" ADD CONSTRAINT "quick_capture_drafts_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "books_site_idx" ON "books" USING btree ("site_id");
  CREATE INDEX "books_publication_idx" ON "books" USING btree ("publication_id");
  CREATE INDEX "books_space_idx" ON "books" USING btree ("space_id");
  CREATE INDEX "books_owner_idx" ON "books" USING btree ("owner_id");
  CREATE INDEX "books_content_idx" ON "books" USING btree ("content_id");
  CREATE INDEX "books_cover_idx" ON "books" USING btree ("cover_id");
  CREATE INDEX "books_updated_at_idx" ON "books" USING btree ("updated_at");
  CREATE INDEX "books_created_at_idx" ON "books" USING btree ("created_at");
  CREATE INDEX "books_rels_order_idx" ON "books_rels" USING btree ("order");
  CREATE INDEX "books_rels_parent_idx" ON "books_rels" USING btree ("parent_id");
  CREATE INDEX "books_rels_path_idx" ON "books_rels" USING btree ("path");
  CREATE INDEX "books_rels_media_assets_id_idx" ON "books_rels" USING btree ("media_assets_id");
  CREATE INDEX "book_parts_book_idx" ON "book_parts" USING btree ("book_id");
  CREATE INDEX "book_parts_updated_at_idx" ON "book_parts" USING btree ("updated_at");
  CREATE INDEX "book_parts_created_at_idx" ON "book_parts" USING btree ("created_at");
  CREATE INDEX "book_chapters_book_idx" ON "book_chapters" USING btree ("book_id");
  CREATE INDEX "book_chapters_part_idx" ON "book_chapters" USING btree ("part_id");
  CREATE INDEX "book_chapters_content_idx" ON "book_chapters" USING btree ("content_id");
  CREATE INDEX "book_chapters_updated_at_idx" ON "book_chapters" USING btree ("updated_at");
  CREATE INDEX "book_chapters_created_at_idx" ON "book_chapters" USING btree ("created_at");
  CREATE INDEX "book_editions_book_idx" ON "book_editions" USING btree ("book_id");
  CREATE INDEX "book_editions_download_idx" ON "book_editions" USING btree ("download_id");
  CREATE INDEX "book_editions_updated_at_idx" ON "book_editions" USING btree ("updated_at");
  CREATE INDEX "book_editions_created_at_idx" ON "book_editions" USING btree ("created_at");
  CREATE INDEX "podcast_shows_site_idx" ON "podcast_shows" USING btree ("site_id");
  CREATE INDEX "podcast_shows_publication_idx" ON "podcast_shows" USING btree ("publication_id");
  CREATE INDEX "podcast_shows_space_idx" ON "podcast_shows" USING btree ("space_id");
  CREATE INDEX "podcast_shows_owner_idx" ON "podcast_shows" USING btree ("owner_id");
  CREATE INDEX "podcast_shows_content_idx" ON "podcast_shows" USING btree ("content_id");
  CREATE INDEX "podcast_shows_artwork_idx" ON "podcast_shows" USING btree ("artwork_id");
  CREATE INDEX "podcast_shows_updated_at_idx" ON "podcast_shows" USING btree ("updated_at");
  CREATE INDEX "podcast_shows_created_at_idx" ON "podcast_shows" USING btree ("created_at");
  CREATE INDEX "podcast_shows_rels_order_idx" ON "podcast_shows_rels" USING btree ("order");
  CREATE INDEX "podcast_shows_rels_parent_idx" ON "podcast_shows_rels" USING btree ("parent_id");
  CREATE INDEX "podcast_shows_rels_path_idx" ON "podcast_shows_rels" USING btree ("path");
  CREATE INDEX "podcast_shows_rels_authors_id_idx" ON "podcast_shows_rels" USING btree ("authors_id");
  CREATE INDEX "podcast_seasons_show_idx" ON "podcast_seasons" USING btree ("show_id");
  CREATE INDEX "podcast_seasons_updated_at_idx" ON "podcast_seasons" USING btree ("updated_at");
  CREATE INDEX "podcast_seasons_created_at_idx" ON "podcast_seasons" USING btree ("created_at");
  CREATE INDEX "podcast_episodes_site_idx" ON "podcast_episodes" USING btree ("site_id");
  CREATE INDEX "podcast_episodes_publication_idx" ON "podcast_episodes" USING btree ("publication_id");
  CREATE INDEX "podcast_episodes_space_idx" ON "podcast_episodes" USING btree ("space_id");
  CREATE INDEX "podcast_episodes_owner_idx" ON "podcast_episodes" USING btree ("owner_id");
  CREATE INDEX "podcast_episodes_content_idx" ON "podcast_episodes" USING btree ("content_id");
  CREATE INDEX "podcast_episodes_show_idx" ON "podcast_episodes" USING btree ("show_id");
  CREATE INDEX "podcast_episodes_season_idx" ON "podcast_episodes" USING btree ("season_id");
  CREATE INDEX "podcast_episodes_audio_idx" ON "podcast_episodes" USING btree ("audio_id");
  CREATE UNIQUE INDEX "podcast_episodes_provider_identity_idx" ON "podcast_episodes" USING btree ("provider_identity");
  CREATE INDEX "podcast_episodes_transcript_idx" ON "podcast_episodes" USING btree ("transcript_id");
  CREATE INDEX "podcast_episodes_updated_at_idx" ON "podcast_episodes" USING btree ("updated_at");
  CREATE INDEX "podcast_episodes_created_at_idx" ON "podcast_episodes" USING btree ("created_at");
  CREATE INDEX "podcast_episodes_rels_order_idx" ON "podcast_episodes_rels" USING btree ("order");
  CREATE INDEX "podcast_episodes_rels_parent_idx" ON "podcast_episodes_rels" USING btree ("parent_id");
  CREATE INDEX "podcast_episodes_rels_path_idx" ON "podcast_episodes_rels" USING btree ("path");
  CREATE INDEX "podcast_episodes_rels_authors_id_idx" ON "podcast_episodes_rels" USING btree ("authors_id");
  CREATE INDEX "video_channels_site_idx" ON "video_channels" USING btree ("site_id");
  CREATE INDEX "video_channels_publication_idx" ON "video_channels" USING btree ("publication_id");
  CREATE INDEX "video_channels_space_idx" ON "video_channels" USING btree ("space_id");
  CREATE INDEX "video_channels_owner_idx" ON "video_channels" USING btree ("owner_id");
  CREATE INDEX "video_channels_content_idx" ON "video_channels" USING btree ("content_id");
  CREATE INDEX "video_channels_updated_at_idx" ON "video_channels" USING btree ("updated_at");
  CREATE INDEX "video_channels_created_at_idx" ON "video_channels" USING btree ("created_at");
  CREATE INDEX "video_playlists_site_idx" ON "video_playlists" USING btree ("site_id");
  CREATE INDEX "video_playlists_publication_idx" ON "video_playlists" USING btree ("publication_id");
  CREATE INDEX "video_playlists_space_idx" ON "video_playlists" USING btree ("space_id");
  CREATE INDEX "video_playlists_owner_idx" ON "video_playlists" USING btree ("owner_id");
  CREATE INDEX "video_playlists_content_idx" ON "video_playlists" USING btree ("content_id");
  CREATE INDEX "video_playlists_channel_idx" ON "video_playlists" USING btree ("channel_id");
  CREATE INDEX "video_playlists_updated_at_idx" ON "video_playlists" USING btree ("updated_at");
  CREATE INDEX "video_playlists_created_at_idx" ON "video_playlists" USING btree ("created_at");
  CREATE INDEX "videos_site_idx" ON "videos" USING btree ("site_id");
  CREATE INDEX "videos_publication_idx" ON "videos" USING btree ("publication_id");
  CREATE INDEX "videos_space_idx" ON "videos" USING btree ("space_id");
  CREATE INDEX "videos_owner_idx" ON "videos" USING btree ("owner_id");
  CREATE INDEX "videos_content_idx" ON "videos" USING btree ("content_id");
  CREATE INDEX "videos_channel_idx" ON "videos" USING btree ("channel_id");
  CREATE INDEX "videos_playlist_idx" ON "videos" USING btree ("playlist_id");
  CREATE INDEX "videos_thumbnail_idx" ON "videos" USING btree ("thumbnail_id");
  CREATE INDEX "videos_transcript_idx" ON "videos" USING btree ("transcript_id");
  CREATE INDEX "videos_derives_from_idx" ON "videos" USING btree ("derives_from_id");
  CREATE INDEX "videos_updated_at_idx" ON "videos" USING btree ("updated_at");
  CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");
  CREATE INDEX "interviews_site_idx" ON "interviews" USING btree ("site_id");
  CREATE INDEX "interviews_publication_idx" ON "interviews" USING btree ("publication_id");
  CREATE INDEX "interviews_space_idx" ON "interviews" USING btree ("space_id");
  CREATE INDEX "interviews_owner_idx" ON "interviews" USING btree ("owner_id");
  CREATE INDEX "interviews_content_idx" ON "interviews" USING btree ("content_id");
  CREATE INDEX "interviews_media_idx" ON "interviews" USING btree ("media_id");
  CREATE INDEX "interviews_transcript_idx" ON "interviews" USING btree ("transcript_id");
  CREATE INDEX "interviews_updated_at_idx" ON "interviews" USING btree ("updated_at");
  CREATE INDEX "interviews_created_at_idx" ON "interviews" USING btree ("created_at");
  CREATE INDEX "interviews_rels_order_idx" ON "interviews_rels" USING btree ("order");
  CREATE INDEX "interviews_rels_parent_idx" ON "interviews_rels" USING btree ("parent_id");
  CREATE INDEX "interviews_rels_path_idx" ON "interviews_rels" USING btree ("path");
  CREATE INDEX "interviews_rels_authors_id_idx" ON "interviews_rels" USING btree ("authors_id");
  CREATE INDEX "interviews_rels_sources_id_idx" ON "interviews_rels" USING btree ("sources_id");
  CREATE INDEX "livestreams_site_idx" ON "livestreams" USING btree ("site_id");
  CREATE INDEX "livestreams_publication_idx" ON "livestreams" USING btree ("publication_id");
  CREATE INDEX "livestreams_space_idx" ON "livestreams" USING btree ("space_id");
  CREATE INDEX "livestreams_owner_idx" ON "livestreams" USING btree ("owner_id");
  CREATE INDEX "livestreams_content_idx" ON "livestreams" USING btree ("content_id");
  CREATE INDEX "livestreams_replay_idx" ON "livestreams" USING btree ("replay_id");
  CREATE INDEX "livestreams_transcript_idx" ON "livestreams" USING btree ("transcript_id");
  CREATE INDEX "livestreams_campaign_idx" ON "livestreams" USING btree ("campaign_id");
  CREATE INDEX "livestreams_updated_at_idx" ON "livestreams" USING btree ("updated_at");
  CREATE INDEX "livestreams_created_at_idx" ON "livestreams" USING btree ("created_at");
  CREATE INDEX "transcript_revisions_media_idx" ON "transcript_revisions" USING btree ("media_id");
  CREATE INDEX "transcript_revisions_source_revision_idx" ON "transcript_revisions" USING btree ("source_revision_id");
  CREATE INDEX "transcript_revisions_updated_at_idx" ON "transcript_revisions" USING btree ("updated_at");
  CREATE INDEX "transcript_revisions_created_at_idx" ON "transcript_revisions" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_jobs_idempotency_key_idx" ON "media_jobs" USING btree ("idempotency_key");
  CREATE INDEX "media_jobs_updated_at_idx" ON "media_jobs" USING btree ("updated_at");
  CREATE INDEX "media_jobs_created_at_idx" ON "media_jobs" USING btree ("created_at");
  CREATE INDEX "tts_outputs_content_idx" ON "tts_outputs" USING btree ("content_id");
  CREATE INDEX "tts_outputs_source_revision_idx" ON "tts_outputs" USING btree ("source_revision_id");
  CREATE INDEX "tts_outputs_audio_idx" ON "tts_outputs" USING btree ("audio_id");
  CREATE INDEX "tts_outputs_updated_at_idx" ON "tts_outputs" USING btree ("updated_at");
  CREATE INDEX "tts_outputs_created_at_idx" ON "tts_outputs" USING btree ("created_at");
  CREATE INDEX "graphic_documents_source_media_idx" ON "graphic_documents" USING btree ("source_media_id");
  CREATE INDEX "graphic_documents_brand_kit_idx" ON "graphic_documents" USING btree ("brand_kit_id");
  CREATE INDEX "graphic_documents_updated_at_idx" ON "graphic_documents" USING btree ("updated_at");
  CREATE INDEX "graphic_documents_created_at_idx" ON "graphic_documents" USING btree ("created_at");
  CREATE INDEX "media_derivatives_document_idx" ON "media_derivatives" USING btree ("document_id");
  CREATE INDEX "media_derivatives_source_media_idx" ON "media_derivatives" USING btree ("source_media_id");
  CREATE INDEX "media_derivatives_asset_idx" ON "media_derivatives" USING btree ("asset_id");
  CREATE INDEX "media_derivatives_updated_at_idx" ON "media_derivatives" USING btree ("updated_at");
  CREATE INDEX "media_derivatives_created_at_idx" ON "media_derivatives" USING btree ("created_at");
  CREATE INDEX "edit_sessions_document_idx" ON "edit_sessions" USING btree ("document_id");
  CREATE INDEX "edit_sessions_updated_at_idx" ON "edit_sessions" USING btree ("updated_at");
  CREATE INDEX "edit_sessions_created_at_idx" ON "edit_sessions" USING btree ("created_at");
  CREATE INDEX "quick_capture_drafts_content_idx" ON "quick_capture_drafts" USING btree ("content_id");
  CREATE UNIQUE INDEX "quick_capture_drafts_client_mutation_id_idx" ON "quick_capture_drafts" USING btree ("client_mutation_id");
  CREATE INDEX "quick_capture_drafts_updated_at_idx" ON "quick_capture_drafts" USING btree ("updated_at");
  CREATE INDEX "quick_capture_drafts_created_at_idx" ON "quick_capture_drafts" USING btree ("created_at");
  CREATE INDEX "quick_capture_drafts_rels_order_idx" ON "quick_capture_drafts_rels" USING btree ("order");
  CREATE INDEX "quick_capture_drafts_rels_parent_idx" ON "quick_capture_drafts_rels" USING btree ("parent_id");
  CREATE INDEX "quick_capture_drafts_rels_path_idx" ON "quick_capture_drafts_rels" USING btree ("path");
  CREATE INDEX "quick_capture_drafts_rels_media_assets_id_idx" ON "quick_capture_drafts_rels" USING btree ("media_assets_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_books_fk" FOREIGN KEY ("books_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_book_parts_fk" FOREIGN KEY ("book_parts_id") REFERENCES "public"."book_parts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_book_chapters_fk" FOREIGN KEY ("book_chapters_id") REFERENCES "public"."book_chapters"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_book_editions_fk" FOREIGN KEY ("book_editions_id") REFERENCES "public"."book_editions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_podcast_shows_fk" FOREIGN KEY ("podcast_shows_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_podcast_seasons_fk" FOREIGN KEY ("podcast_seasons_id") REFERENCES "public"."podcast_seasons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_podcast_episodes_fk" FOREIGN KEY ("podcast_episodes_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_channels_fk" FOREIGN KEY ("video_channels_id") REFERENCES "public"."video_channels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_playlists_fk" FOREIGN KEY ("video_playlists_id") REFERENCES "public"."video_playlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_interviews_fk" FOREIGN KEY ("interviews_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_livestreams_fk" FOREIGN KEY ("livestreams_id") REFERENCES "public"."livestreams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_transcript_revisions_fk" FOREIGN KEY ("transcript_revisions_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_jobs_fk" FOREIGN KEY ("media_jobs_id") REFERENCES "public"."media_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tts_outputs_fk" FOREIGN KEY ("tts_outputs_id") REFERENCES "public"."tts_outputs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_graphic_documents_fk" FOREIGN KEY ("graphic_documents_id") REFERENCES "public"."graphic_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_derivatives_fk" FOREIGN KEY ("media_derivatives_id") REFERENCES "public"."media_derivatives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_edit_sessions_fk" FOREIGN KEY ("edit_sessions_id") REFERENCES "public"."edit_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quick_capture_drafts_fk" FOREIGN KEY ("quick_capture_drafts_id") REFERENCES "public"."quick_capture_drafts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_books_id_idx" ON "payload_locked_documents_rels" USING btree ("books_id");
  CREATE INDEX "payload_locked_documents_rels_book_parts_id_idx" ON "payload_locked_documents_rels" USING btree ("book_parts_id");
  CREATE INDEX "payload_locked_documents_rels_book_chapters_id_idx" ON "payload_locked_documents_rels" USING btree ("book_chapters_id");
  CREATE INDEX "payload_locked_documents_rels_book_editions_id_idx" ON "payload_locked_documents_rels" USING btree ("book_editions_id");
  CREATE INDEX "payload_locked_documents_rels_podcast_shows_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_shows_id");
  CREATE INDEX "payload_locked_documents_rels_podcast_seasons_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_seasons_id");
  CREATE INDEX "payload_locked_documents_rels_podcast_episodes_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_episodes_id");
  CREATE INDEX "payload_locked_documents_rels_video_channels_id_idx" ON "payload_locked_documents_rels" USING btree ("video_channels_id");
  CREATE INDEX "payload_locked_documents_rels_video_playlists_id_idx" ON "payload_locked_documents_rels" USING btree ("video_playlists_id");
  CREATE INDEX "payload_locked_documents_rels_videos_id_idx" ON "payload_locked_documents_rels" USING btree ("videos_id");
  CREATE INDEX "payload_locked_documents_rels_interviews_id_idx" ON "payload_locked_documents_rels" USING btree ("interviews_id");
  CREATE INDEX "payload_locked_documents_rels_livestreams_id_idx" ON "payload_locked_documents_rels" USING btree ("livestreams_id");
  CREATE INDEX "payload_locked_documents_rels_transcript_revisions_id_idx" ON "payload_locked_documents_rels" USING btree ("transcript_revisions_id");
  CREATE INDEX "payload_locked_documents_rels_media_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("media_jobs_id");
  CREATE INDEX "payload_locked_documents_rels_tts_outputs_id_idx" ON "payload_locked_documents_rels" USING btree ("tts_outputs_id");
  CREATE INDEX "payload_locked_documents_rels_graphic_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("graphic_documents_id");
  CREATE INDEX "payload_locked_documents_rels_media_derivatives_id_idx" ON "payload_locked_documents_rels" USING btree ("media_derivatives_id");
  CREATE INDEX "payload_locked_documents_rels_edit_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("edit_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_quick_capture_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("quick_capture_drafts_id");`)},down:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   ALTER TABLE "books" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "books_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "book_parts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "book_chapters" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "book_editions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_shows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_shows_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_seasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_episodes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "podcast_episodes_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "video_channels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "video_playlists" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "videos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "interviews" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "interviews_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "livestreams" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "transcript_revisions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media_jobs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tts_outputs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "graphic_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media_derivatives" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "edit_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quick_capture_drafts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quick_capture_drafts_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "books" CASCADE;
  DROP TABLE "books_rels" CASCADE;
  DROP TABLE "book_parts" CASCADE;
  DROP TABLE "book_chapters" CASCADE;
  DROP TABLE "book_editions" CASCADE;
  DROP TABLE "podcast_shows" CASCADE;
  DROP TABLE "podcast_shows_rels" CASCADE;
  DROP TABLE "podcast_seasons" CASCADE;
  DROP TABLE "podcast_episodes" CASCADE;
  DROP TABLE "podcast_episodes_rels" CASCADE;
  DROP TABLE "video_channels" CASCADE;
  DROP TABLE "video_playlists" CASCADE;
  DROP TABLE "videos" CASCADE;
  DROP TABLE "interviews" CASCADE;
  DROP TABLE "interviews_rels" CASCADE;
  DROP TABLE "livestreams" CASCADE;
  DROP TABLE "transcript_revisions" CASCADE;
  DROP TABLE "media_jobs" CASCADE;
  DROP TABLE "tts_outputs" CASCADE;
  DROP TABLE "graphic_documents" CASCADE;
  DROP TABLE "media_derivatives" CASCADE;
  DROP TABLE "edit_sessions" CASCADE;
  DROP TABLE "quick_capture_drafts" CASCADE;
  DROP TABLE "quick_capture_drafts_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_books_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_book_parts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_book_chapters_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_book_editions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_podcast_shows_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_podcast_seasons_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_podcast_episodes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_video_channels_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_video_playlists_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_videos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_interviews_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_livestreams_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_transcript_revisions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_jobs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tts_outputs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_graphic_documents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_derivatives_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_edit_sessions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quick_capture_drafts_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_books_id_idx";
  DROP INDEX "payload_locked_documents_rels_book_parts_id_idx";
  DROP INDEX "payload_locked_documents_rels_book_chapters_id_idx";
  DROP INDEX "payload_locked_documents_rels_book_editions_id_idx";
  DROP INDEX "payload_locked_documents_rels_podcast_shows_id_idx";
  DROP INDEX "payload_locked_documents_rels_podcast_seasons_id_idx";
  DROP INDEX "payload_locked_documents_rels_podcast_episodes_id_idx";
  DROP INDEX "payload_locked_documents_rels_video_channels_id_idx";
  DROP INDEX "payload_locked_documents_rels_video_playlists_id_idx";
  DROP INDEX "payload_locked_documents_rels_videos_id_idx";
  DROP INDEX "payload_locked_documents_rels_interviews_id_idx";
  DROP INDEX "payload_locked_documents_rels_livestreams_id_idx";
  DROP INDEX "payload_locked_documents_rels_transcript_revisions_id_idx";
  DROP INDEX "payload_locked_documents_rels_media_jobs_id_idx";
  DROP INDEX "payload_locked_documents_rels_tts_outputs_id_idx";
  DROP INDEX "payload_locked_documents_rels_graphic_documents_id_idx";
  DROP INDEX "payload_locked_documents_rels_media_derivatives_id_idx";
  DROP INDEX "payload_locked_documents_rels_edit_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_quick_capture_drafts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "books_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "book_parts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "book_chapters_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "book_editions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "podcast_shows_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "podcast_seasons_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "podcast_episodes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "video_channels_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "video_playlists_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "videos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "interviews_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "livestreams_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "transcript_revisions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_jobs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tts_outputs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "graphic_documents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_derivatives_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "edit_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quick_capture_drafts_id";
  DROP TYPE "public"."enum_books_structured_data_mode";
  DROP TYPE "public"."enum_books_structured_data_source_collection";
  DROP TYPE "public"."enum_book_editions_format";
  DROP TYPE "public"."enum_podcast_shows_structured_data_mode";
  DROP TYPE "public"."enum_podcast_shows_structured_data_source_collection";
  DROP TYPE "public"."enum_podcast_episodes_structured_data_mode";
  DROP TYPE "public"."enum_podcast_episodes_structured_data_source_collection";
  DROP TYPE "public"."enum_video_channels_structured_data_mode";
  DROP TYPE "public"."enum_video_channels_structured_data_source_collection";
  DROP TYPE "public"."enum_video_playlists_structured_data_mode";
  DROP TYPE "public"."enum_video_playlists_structured_data_source_collection";
  DROP TYPE "public"."enum_videos_structured_data_mode";
  DROP TYPE "public"."enum_videos_structured_data_source_collection";
  DROP TYPE "public"."enum_interviews_structured_data_mode";
  DROP TYPE "public"."enum_interviews_structured_data_source_collection";
  DROP TYPE "public"."enum_livestreams_structured_data_mode";
  DROP TYPE "public"."enum_livestreams_structured_data_source_collection";
  DROP TYPE "public"."enum_transcript_revisions_source";
  DROP TYPE "public"."enum_media_jobs_kind";
  DROP TYPE "public"."enum_media_jobs_status";
  DROP TYPE "public"."enum_tts_outputs_mode";
  DROP TYPE "public"."enum_tts_outputs_status";
  DROP TYPE "public"."enum_media_derivatives_preset";
  DROP TYPE "public"."enum_media_derivatives_status";
  DROP TYPE "public"."enum_edit_sessions_status";
  DROP TYPE "public"."enum_quick_capture_drafts_offline_state";`)},name:"20260825_171336"},{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   ALTER TABLE "videos" ADD COLUMN "provider_identity" varchar NOT NULL;
  CREATE UNIQUE INDEX "videos_provider_identity_idx" ON "videos" USING btree ("provider_identity");`)},down:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   DROP INDEX "videos_provider_identity_idx";
  ALTER TABLE "videos" DROP COLUMN "provider_identity";`)},name:"20260825_171738"},{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   CREATE TYPE "public"."enum_social_accounts_network" AS ENUM('activitypub', 'bluesky', 'x', 'threads', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'manual');
  CREATE TYPE "public"."enum_social_accounts_actor_type" AS ENUM('site', 'publication', 'space');
  CREATE TYPE "public"."enum_social_accounts_capability_state" AS ENUM('available', 'limited', 'approval-required', 'manual-handoff', 'unavailable');
  CREATE TYPE "public"."enum_social_accounts_credential_health" AS ENUM('healthy', 'expiring', 'expired', 'revoked', 'not-configured');
  CREATE TYPE "public"."enum_social_drafts_status" AS ENUM('draft', 'review', 'approved', 'queued', 'scheduled', 'publishing', 'published', 'partially-published', 'failed', 'cancelled', 'deletion-requested');
  CREATE TYPE "public"."enum_social_network_variants_network" AS ENUM('activitypub', 'bluesky', 'x', 'threads', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'manual');
  CREATE TYPE "public"."enum_social_network_variants_status" AS ENUM('draft', 'review', 'approved', 'queued', 'scheduled', 'publishing', 'published', 'partially-published', 'failed', 'cancelled', 'deletion-requested');
  CREATE TYPE "public"."enum_social_queue_items_status" AS ENUM('draft', 'review', 'approved', 'queued', 'scheduled', 'publishing', 'published', 'partially-published', 'failed', 'cancelled', 'deletion-requested');
  CREATE TYPE "public"."enum_social_publish_attempts_status" AS ENUM('started', 'published', 'failed', 'unknown');
  CREATE TYPE "public"."enum_external_posts_remote_state" AS ENUM('published', 'deleted', 'tombstoned', 'unknown', 'moderated');
  CREATE TYPE "public"."enum_campaigns_status" AS ENUM('draft', 'review', 'approved', 'queued', 'scheduled', 'publishing', 'published', 'partially-published', 'failed', 'cancelled', 'deletion-requested');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'social-publish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'social-publish';
  CREATE TABLE "social_accounts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"display_name" varchar NOT NULL,
  	"network" "enum_social_accounts_network" NOT NULL,
  	"actor_type" "enum_social_accounts_actor_type" NOT NULL,
  	"external_account_id" varchar NOT NULL,
  	"capability_state" "enum_social_accounts_capability_state" DEFAULT 'manual-handoff' NOT NULL,
  	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"credential_health" "enum_social_accounts_credential_health" DEFAULT 'not-configured',
  	"credential_expires_at" timestamp(3) with time zone,
  	"connection_reference" varchar,
  	"last_verified_at" timestamp(3) with time zone,
  	"diagnostics" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_drafts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"source_content_id" uuid,
  	"source_revision_id" uuid,
  	"campaign_id" uuid,
  	"status" "enum_social_drafts_status" DEFAULT 'draft' NOT NULL,
  	"requires_review" boolean DEFAULT true,
  	"provenance" jsonb,
  	"canonical_url" varchar,
  	"created_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_network_variants" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"draft_id" uuid NOT NULL,
  	"account_id" uuid NOT NULL,
  	"label" varchar NOT NULL,
  	"network" "enum_social_network_variants_network" NOT NULL,
  	"text" varchar NOT NULL,
  	"link_url" varchar,
  	"validation" jsonb DEFAULT '[]'::jsonb,
  	"status" "enum_social_network_variants_status" DEFAULT 'draft' NOT NULL,
  	"approval_hash" varchar,
  	"approved_at" timestamp(3) with time zone,
  	"approved_by_id" uuid,
  	"idempotency_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_network_variants_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_assets_id" uuid
  );
  
  CREATE TABLE "social_queue_items" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"account_id" uuid NOT NULL,
  	"scheduled_for" timestamp(3) with time zone NOT NULL,
  	"time_zone" varchar NOT NULL,
  	"status" "enum_social_queue_items_status" DEFAULT 'scheduled' NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"lease_until" timestamp(3) with time zone,
  	"lease_owner" varchar,
  	"attempt_count" numeric DEFAULT 0,
  	"next_attempt_at" timestamp(3) with time zone,
  	"dead_letter_reason" jsonb,
  	"cancelled_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_publish_attempts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"queue_item_id" uuid NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"attempt_number" numeric NOT NULL,
  	"status" "enum_social_publish_attempts_status" NOT NULL,
  	"request" jsonb,
  	"response" jsonb,
  	"error" jsonb,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "external_posts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"account_id" uuid NOT NULL,
  	"remote_id" varchar NOT NULL,
  	"remote_url" varchar,
  	"remote_state" "enum_external_posts_remote_state" DEFAULT 'published',
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"delete_requested_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "campaigns" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"source_content_id" uuid,
  	"status" "enum_campaigns_status" DEFAULT 'draft' NOT NULL,
  	"launch_at" timestamp(3) with time zone,
  	"time_zone" varchar,
  	"goals" jsonb,
  	"newsletter_hook" jsonb,
  	"product_links" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "campaigns_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"graphic_documents_id" uuid
  );
  
  CREATE TABLE "calendar_entry_audits" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"calendar_entry_id" uuid NOT NULL,
  	"action" varchar NOT NULL,
  	"actor_id" uuid,
  	"before" jsonb,
  	"after" jsonb,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_accounts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_drafts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_network_variants_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_queue_items_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_publish_attempts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "external_posts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "campaigns_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "calendar_entry_audits_id" uuid;
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_source_content_id_content_id_fk" FOREIGN KEY ("source_content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_source_revision_id_revision_records_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_network_variants" ADD CONSTRAINT "social_network_variants_draft_id_social_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."social_drafts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_network_variants" ADD CONSTRAINT "social_network_variants_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_network_variants" ADD CONSTRAINT "social_network_variants_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_network_variants_rels" ADD CONSTRAINT "social_network_variants_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."social_network_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "social_network_variants_rels" ADD CONSTRAINT "social_network_variants_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "social_queue_items" ADD CONSTRAINT "social_queue_items_variant_id_social_network_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."social_network_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_queue_items" ADD CONSTRAINT "social_queue_items_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_queue_item_id_social_queue_items_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."social_queue_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_variant_id_social_network_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."social_network_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "external_posts" ADD CONSTRAINT "external_posts_variant_id_social_network_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."social_network_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "external_posts" ADD CONSTRAINT "external_posts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_source_content_id_content_id_fk" FOREIGN KEY ("source_content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns_rels" ADD CONSTRAINT "campaigns_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "campaigns_rels" ADD CONSTRAINT "campaigns_rels_graphic_documents_fk" FOREIGN KEY ("graphic_documents_id") REFERENCES "public"."graphic_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calendar_entry_audits" ADD CONSTRAINT "calendar_entry_audits_calendar_entry_id_calendar_entries_id_fk" FOREIGN KEY ("calendar_entry_id") REFERENCES "public"."calendar_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_entry_audits" ADD CONSTRAINT "calendar_entry_audits_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "social_accounts_site_idx" ON "social_accounts" USING btree ("site_id");
  CREATE INDEX "social_accounts_publication_idx" ON "social_accounts" USING btree ("publication_id");
  CREATE INDEX "social_accounts_space_idx" ON "social_accounts" USING btree ("space_id");
  CREATE INDEX "social_accounts_owner_idx" ON "social_accounts" USING btree ("owner_id");
  CREATE INDEX "social_accounts_updated_at_idx" ON "social_accounts" USING btree ("updated_at");
  CREATE INDEX "social_accounts_created_at_idx" ON "social_accounts" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_network_externalAccountId_idx" ON "social_accounts" USING btree ("site_id","network","external_account_id");
  CREATE INDEX "social_drafts_site_idx" ON "social_drafts" USING btree ("site_id");
  CREATE INDEX "social_drafts_publication_idx" ON "social_drafts" USING btree ("publication_id");
  CREATE INDEX "social_drafts_space_idx" ON "social_drafts" USING btree ("space_id");
  CREATE INDEX "social_drafts_owner_idx" ON "social_drafts" USING btree ("owner_id");
  CREATE INDEX "social_drafts_source_content_idx" ON "social_drafts" USING btree ("source_content_id");
  CREATE INDEX "social_drafts_source_revision_idx" ON "social_drafts" USING btree ("source_revision_id");
  CREATE INDEX "social_drafts_campaign_idx" ON "social_drafts" USING btree ("campaign_id");
  CREATE INDEX "social_drafts_created_by_idx" ON "social_drafts" USING btree ("created_by_id");
  CREATE INDEX "social_drafts_updated_at_idx" ON "social_drafts" USING btree ("updated_at");
  CREATE INDEX "social_drafts_created_at_idx" ON "social_drafts" USING btree ("created_at");
  CREATE INDEX "social_network_variants_draft_idx" ON "social_network_variants" USING btree ("draft_id");
  CREATE INDEX "social_network_variants_account_idx" ON "social_network_variants" USING btree ("account_id");
  CREATE INDEX "social_network_variants_approved_by_idx" ON "social_network_variants" USING btree ("approved_by_id");
  CREATE UNIQUE INDEX "social_network_variants_idempotency_key_idx" ON "social_network_variants" USING btree ("idempotency_key");
  CREATE INDEX "social_network_variants_updated_at_idx" ON "social_network_variants" USING btree ("updated_at");
  CREATE INDEX "social_network_variants_created_at_idx" ON "social_network_variants" USING btree ("created_at");
  CREATE INDEX "social_network_variants_rels_order_idx" ON "social_network_variants_rels" USING btree ("order");
  CREATE INDEX "social_network_variants_rels_parent_idx" ON "social_network_variants_rels" USING btree ("parent_id");
  CREATE INDEX "social_network_variants_rels_path_idx" ON "social_network_variants_rels" USING btree ("path");
  CREATE INDEX "social_network_variants_rels_media_assets_id_idx" ON "social_network_variants_rels" USING btree ("media_assets_id");
  CREATE INDEX "social_queue_items_variant_idx" ON "social_queue_items" USING btree ("variant_id");
  CREATE INDEX "social_queue_items_account_idx" ON "social_queue_items" USING btree ("account_id");
  CREATE INDEX "social_queue_items_scheduled_for_idx" ON "social_queue_items" USING btree ("scheduled_for");
  CREATE UNIQUE INDEX "social_queue_items_idempotency_key_idx" ON "social_queue_items" USING btree ("idempotency_key");
  CREATE INDEX "social_queue_items_updated_at_idx" ON "social_queue_items" USING btree ("updated_at");
  CREATE INDEX "social_queue_items_created_at_idx" ON "social_queue_items" USING btree ("created_at");
  CREATE INDEX "social_publish_attempts_queue_item_idx" ON "social_publish_attempts" USING btree ("queue_item_id");
  CREATE INDEX "social_publish_attempts_variant_idx" ON "social_publish_attempts" USING btree ("variant_id");
  CREATE INDEX "social_publish_attempts_idempotency_key_idx" ON "social_publish_attempts" USING btree ("idempotency_key");
  CREATE INDEX "social_publish_attempts_updated_at_idx" ON "social_publish_attempts" USING btree ("updated_at");
  CREATE INDEX "social_publish_attempts_created_at_idx" ON "social_publish_attempts" USING btree ("created_at");
  CREATE UNIQUE INDEX "external_posts_variant_idx" ON "external_posts" USING btree ("variant_id");
  CREATE INDEX "external_posts_account_idx" ON "external_posts" USING btree ("account_id");
  CREATE INDEX "external_posts_updated_at_idx" ON "external_posts" USING btree ("updated_at");
  CREATE INDEX "external_posts_created_at_idx" ON "external_posts" USING btree ("created_at");
  CREATE INDEX "campaigns_site_idx" ON "campaigns" USING btree ("site_id");
  CREATE INDEX "campaigns_publication_idx" ON "campaigns" USING btree ("publication_id");
  CREATE INDEX "campaigns_space_idx" ON "campaigns" USING btree ("space_id");
  CREATE INDEX "campaigns_owner_idx" ON "campaigns" USING btree ("owner_id");
  CREATE INDEX "campaigns_source_content_idx" ON "campaigns" USING btree ("source_content_id");
  CREATE INDEX "campaigns_updated_at_idx" ON "campaigns" USING btree ("updated_at");
  CREATE INDEX "campaigns_created_at_idx" ON "campaigns" USING btree ("created_at");
  CREATE INDEX "campaigns_rels_order_idx" ON "campaigns_rels" USING btree ("order");
  CREATE INDEX "campaigns_rels_parent_idx" ON "campaigns_rels" USING btree ("parent_id");
  CREATE INDEX "campaigns_rels_path_idx" ON "campaigns_rels" USING btree ("path");
  CREATE INDEX "campaigns_rels_graphic_documents_id_idx" ON "campaigns_rels" USING btree ("graphic_documents_id");
  CREATE INDEX "calendar_entry_audits_calendar_entry_idx" ON "calendar_entry_audits" USING btree ("calendar_entry_id");
  CREATE INDEX "calendar_entry_audits_actor_idx" ON "calendar_entry_audits" USING btree ("actor_id");
  CREATE INDEX "calendar_entry_audits_updated_at_idx" ON "calendar_entry_audits" USING btree ("updated_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_accounts_fk" FOREIGN KEY ("social_accounts_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_drafts_fk" FOREIGN KEY ("social_drafts_id") REFERENCES "public"."social_drafts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_network_variants_fk" FOREIGN KEY ("social_network_variants_id") REFERENCES "public"."social_network_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_queue_items_fk" FOREIGN KEY ("social_queue_items_id") REFERENCES "public"."social_queue_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_publish_attempts_fk" FOREIGN KEY ("social_publish_attempts_id") REFERENCES "public"."social_publish_attempts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_external_posts_fk" FOREIGN KEY ("external_posts_id") REFERENCES "public"."external_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_campaigns_fk" FOREIGN KEY ("campaigns_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_calendar_entry_audits_fk" FOREIGN KEY ("calendar_entry_audits_id") REFERENCES "public"."calendar_entry_audits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_social_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_social_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_drafts_id");
  CREATE INDEX "payload_locked_documents_rels_social_network_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("social_network_variants_id");
  CREATE INDEX "payload_locked_documents_rels_social_queue_items_id_idx" ON "payload_locked_documents_rels" USING btree ("social_queue_items_id");
  CREATE INDEX "payload_locked_documents_rels_social_publish_attempts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_publish_attempts_id");
  CREATE INDEX "payload_locked_documents_rels_external_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("external_posts_id");
  CREATE INDEX "payload_locked_documents_rels_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("campaigns_id");
  CREATE INDEX "payload_locked_documents_rels_calendar_entry_audits_id_idx" ON "payload_locked_documents_rels" USING btree ("calendar_entry_audits_id");`)},down:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   ALTER TABLE "social_accounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_drafts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_network_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_network_variants_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_queue_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_publish_attempts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "external_posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "campaigns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "campaigns_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "calendar_entry_audits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "social_accounts" CASCADE;
  DROP TABLE "social_drafts" CASCADE;
  DROP TABLE "social_network_variants" CASCADE;
  DROP TABLE "social_network_variants_rels" CASCADE;
  DROP TABLE "social_queue_items" CASCADE;
  DROP TABLE "social_publish_attempts" CASCADE;
  DROP TABLE "external_posts" CASCADE;
  DROP TABLE "campaigns" CASCADE;
  DROP TABLE "campaigns_rels" CASCADE;
  DROP TABLE "calendar_entry_audits" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_accounts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_drafts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_network_variants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_queue_items_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_publish_attempts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_external_posts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_campaigns_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_calendar_entry_audits_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish', 'media-import', 'media-render', 'media-transcribe', 'media-tts');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish', 'media-import', 'media-render', 'media-transcribe', 'media-tts');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_social_accounts_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_drafts_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_network_variants_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_queue_items_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_publish_attempts_id_idx";
  DROP INDEX "payload_locked_documents_rels_external_posts_id_idx";
  DROP INDEX "payload_locked_documents_rels_campaigns_id_idx";
  DROP INDEX "payload_locked_documents_rels_calendar_entry_audits_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_accounts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_drafts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_network_variants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_queue_items_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_publish_attempts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "external_posts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "campaigns_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "calendar_entry_audits_id";
  DROP TYPE "public"."enum_social_accounts_network";
  DROP TYPE "public"."enum_social_accounts_actor_type";
  DROP TYPE "public"."enum_social_accounts_capability_state";
  DROP TYPE "public"."enum_social_accounts_credential_health";
  DROP TYPE "public"."enum_social_drafts_status";
  DROP TYPE "public"."enum_social_network_variants_network";
  DROP TYPE "public"."enum_social_network_variants_status";
  DROP TYPE "public"."enum_social_queue_items_status";
  DROP TYPE "public"."enum_social_publish_attempts_status";
  DROP TYPE "public"."enum_external_posts_remote_state";
  DROP TYPE "public"."enum_campaigns_status";`)},name:"20260825_173116_social_distribution"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TYPE "public"."enum_content_releases_status" AS ENUM('draft', 'scheduled', 'released', 'cancelled');
    CREATE TYPE "public"."enum_media_assets_rights_status" AS ENUM('pending', 'approved', 'restricted', 'expired');
    CREATE TABLE "content_releases" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL, "publication_id" uuid, "space_id" uuid, "owner_id" uuid,
      "title" varchar NOT NULL, "content_id" uuid, "article_id" uuid,
      "scheduled_for" timestamp(3) with time zone, "time_zone" varchar DEFAULT 'UTC',
      "status" "enum_content_releases_status" DEFAULT 'draft', "last_schedule_mutation_id" varchar,
      "schedule_audit" jsonb DEFAULT '[]'::jsonb, "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "media_assets" ADD COLUMN "rights_status" "enum_media_assets_rights_status" DEFAULT 'approved';
    ALTER TABLE "graphic_documents" ADD COLUMN "site_id" uuid, ADD COLUMN "publication_id" uuid, ADD COLUMN "space_id" uuid, ADD COLUMN "owner_id" uuid, ADD COLUMN "template" varchar, ADD COLUMN "layout_variant" varchar;
    ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "content_releases_scheduled_for_idx" ON "content_releases" USING btree ("scheduled_for");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE "content_releases" CASCADE;
    ALTER TABLE "media_assets" DROP COLUMN "rights_status";
    ALTER TABLE "graphic_documents" DROP COLUMN "site_id", DROP COLUMN "publication_id", DROP COLUMN "space_id", DROP COLUMN "owner_id", DROP COLUMN "template", DROP COLUMN "layout_variant";
    DROP TYPE "public"."enum_content_releases_status";
    DROP TYPE "public"."enum_media_assets_rights_status";
  `)},name:"20260825_180000_calendar_graphics"},{up:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   DO $$ BEGIN
    CREATE TYPE "public"."enum_media_assets_rights_status" AS ENUM('pending', 'approved', 'restricted', 'expired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_content_releases_status" AS ENUM('draft', 'scheduled', 'released', 'cancelled');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_campaigns_visibility" AS ENUM('public', 'private');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_campaigns_supporter_visibility" AS ENUM('aggregate', 'named-opt-in', 'private');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_definitions_template" AS ENUM('contact', 'newsletter-signup', 'volunteer', 'sponsorship-inquiry', 'advertiser-media-kit', 'donation-interest', 'reader-submission', 'confidential-tip', 'event-rsvp', 'survey', 'poll', 'application', 'waitlist', 'quote-request', 'product-preorder-interest', 'custom');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_definitions_visibility" AS ENUM('public', 'private', 'members');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_definitions_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_definitions_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_schemas_state" AS ENUM('draft', 'published', 'retired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_schemas_consent_translation_status" AS ENUM('not-required', 'reviewed', 'outdated', 'machine-generated');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_submissions_status" AS ENUM('received', 'challenged', 'held', 'triaged', 'accepted', 'rejected', 'redacted', 'expired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_submissions_privacy_class" AS ENUM('standard', 'sensitive', 'confidential');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_submissions_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_form_submissions_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_submission_attachments_scan_status" AS ENUM('pending', 'clean', 'rejected');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_contacts_status" AS ENUM('lead', 'active', 'inactive', 'blocked', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_contacts_merge_state" AS ENUM('clear', 'proposed', 'merged');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_contacts_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_contacts_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_organizations_status" AS ENUM('lead', 'active', 'inactive', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_organizations_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_organizations_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_interaction_records_kind" AS ENUM('form', 'email', 'call', 'meeting', 'note', 'campaign', 'order', 'contribution');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_deals_opportunities_stage" AS ENUM('new', 'qualified', 'proposal', 'creative-approval', 'placement', 'won', 'lost');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_next_actions_status" AS ENUM('open', 'done', 'cancelled');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_workflow_items_type" AS ENUM('campaign-launch', 'sponsor-approval', 'social-package', 'event-production', 'product-launch', 'media-processing', 'moderation', 'outreach', 'form-intake', 'partner-follow-up', 'system-exception', 'custom');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_workflow_items_status" AS ENUM('open', 'in-progress', 'blocked', 'completed', 'cancelled', 'reopened');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_workflow_items_priority" AS ENUM('low', 'normal', 'high', 'urgent');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_audience_lists_status" AS ENUM('active', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_audience_segments_status" AS ENUM('active', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_audience_memberships_status" AS ENUM('pending', 'active', 'unsubscribed', 'suppressed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_subscribers_status" AS ENUM('pending', 'active', 'unsubscribed', 'suppressed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_consent_events_event" AS ENUM('requested', 'double-opt-in-confirmed', 'unsubscribe', 'resubscribe', 'imported', 'bounce', 'complaint');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_suppressions_reason" AS ENUM('unsubscribe', 'bounce', 'complaint', 'provider');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_email_messages_kind" AS ENUM('transactional', 'bulk', 'digest');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_email_messages_status" AS ENUM('draft', 'review', 'scheduled', 'queued', 'sending', 'sent', 'cancelled', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_email_deliveries_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'cancelled', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_notifications_status" AS ENUM('unread', 'read', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_notification_channels_kind" AS ENUM('in-app', 'email', 'push');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_digest_definitions_cadence" AS ENUM('immediate', 'daily', 'weekly', 'custom');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_digest_runs_status" AS ENUM('draft', 'queued', 'sent', 'failed', 'cancelled');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_delivery_receipts_channel" AS ENUM('email', 'push', 'in-app');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_delivery_receipts_status" AS ENUM('queued', 'sent', 'delivered', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_automation_definitions_status" AS ENUM('draft', 'active', 'paused', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_events_consent_basis" AS ENUM('necessary', 'analytics-consent', 'server-trusted', 'denied');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_events_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_events_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_rollups_grain" AS ENUM('daily', 'campaign', 'content', 'channel', 'goal');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_rollups_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analytics_rollups_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_metric_snapshots_grain" AS ENUM('event', 'daily', 'campaign', 'order', 'delivery');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_metric_snapshots_reconciliation_status" AS ENUM('unreconciled', 'reconciled', 'provider-reported', 'estimated');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_metric_snapshots_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_metric_snapshots_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experience_rules_status" AS ENUM('draft', 'approved', 'active', 'paused', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experience_variants_status" AS ENUM('draft', 'approved', 'active', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experiments_state" AS ENUM('draft', 'approved', 'running', 'paused', 'stopped', 'inconclusive', 'winner-selected');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experiment_events_kind" AS ENUM('exposure', 'conversion');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_experiment_decisions_decision" AS ENUM('pause', 'stop', 'inconclusive', 'winner-selected');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_policies_status" AS ENUM('draft', 'active', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_rules_severity" AS ENUM('informational', 'warning', 'publication_blocking');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_scans_target_type" AS ENUM('document', 'content-release', 'publication', 'space', 'site');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_scans_status" AS ENUM('queued', 'running', 'completed', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_issues_severity" AS ENUM('informational', 'warning', 'publication_blocking');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_quality_issues_status" AS ENUM('open', 'resolved', 'waived', 'uncertain');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_merchant_connections_status" AS ENUM('active', 'disabled', 'degraded');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payment_method_capabilities_family" AS ENUM('card', 'wallet', 'bank-debit', 'bank-transfer', 'open-banking', 'mobile-money', 'cash-voucher', 'buy-now-pay-later', 'crypto', 'external-link');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payment_method_capabilities_flow" AS ENUM('hosted', 'redirect', 'qr', 'asynchronous', 'manual');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payment_method_capabilities_health" AS ENUM('healthy', 'degraded', 'unavailable');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_variants_inventory_policy" AS ENUM('untracked', 'tracked', 'external-hook', 'pod-provider');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_prices_recurring_interval" AS ENUM('month', 'year');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_kind" AS ENUM('physical', 'digital', 'pod-reference', 'subscription', 'membership');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_state" AS ENUM('draft', 'review', 'approved', 'published', 'archived');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_retention_mode" AS ENUM('permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_products_retention_hold" AS ENUM('none', 'legal', 'moderation');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_carts_state" AS ENUM('active', 'converted', 'abandoned', 'expired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_checkout_sessions_state" AS ENUM('open', 'pending', 'completed', 'failed', 'cancelled', 'abandoned', 'expired');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payment_intents_state" AS ENUM('created', 'requires-action', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'disputed', 'exception');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_orders_state" AS ENUM('pending-payment', 'paid', 'fulfilling', 'fulfilled', 'cancelled', 'failed', 'refunded', 'exception');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_supporters_visibility_preference" AS ENUM('public', 'anonymous', 'private');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TYPE "public"."enum_media_usages_purpose" ADD VALUE 'newsletter';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'audience-email-delivery';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'audience-newsletter-dispatch';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'commerce-abandon-checkouts';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'audience-email-delivery';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'audience-newsletter-dispatch';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'commerce-abandon-checkouts';
  -- Content releases existed before the Second Pass. Preserve its rows and add only the new commerce fields.
  ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "product_id" uuid;
  ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "product_revision" varchar;
  CREATE TABLE "form_definitions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"template" "enum_form_definitions_template" DEFAULT 'custom' NOT NULL,
  	"public_path" varchar NOT NULL,
  	"visibility" "enum_form_definitions_visibility" DEFAULT 'public' NOT NULL,
  	"active_schema_id" uuid,
  	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"retention_mode" "enum_form_definitions_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_form_definitions_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "form_schemas" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"form_id" uuid NOT NULL,
  	"version" numeric NOT NULL,
  	"state" "enum_form_schemas_state" DEFAULT 'draft' NOT NULL,
  	"locale" varchar DEFAULT 'en' NOT NULL,
  	"schema" jsonb NOT NULL,
  	"consent_text" varchar,
  	"consent_revision" varchar,
  	"consent_translation_status" "enum_form_schemas_consent_translation_status" DEFAULT 'not-required' NOT NULL,
  	"translation_project" varchar,
  	"locale_completeness" jsonb,
  	"brand_snapshot" jsonb,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "form_submissions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"form_id" uuid NOT NULL,
  	"schema_id" uuid NOT NULL,
  	"status" "enum_form_submissions_status" DEFAULT 'received' NOT NULL,
  	"locale" varchar NOT NULL,
  	"values" jsonb NOT NULL,
  	"consent_snapshot" jsonb,
  	"privacy_class" "enum_form_submissions_privacy_class" DEFAULT 'standard' NOT NULL,
  	"abuse" jsonb,
  	"contact_id" uuid,
  	"organization_id" uuid,
  	"workflow_item_id" uuid,
  	"idempotency_key" varchar,
  	"retention_mode" "enum_form_submissions_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_form_submissions_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "submission_attachments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"submission_id" uuid NOT NULL,
  	"media_id" uuid,
  	"filename" varchar NOT NULL,
  	"content_type" varchar,
  	"size" numeric,
  	"scan_status" "enum_submission_attachments_scan_status" DEFAULT 'pending' NOT NULL,
  	"private" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contacts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"display_name" varchar NOT NULL,
  	"email" varchar,
  	"email_hash" varchar,
  	"member_id" uuid,
  	"status" "enum_contacts_status" DEFAULT 'lead' NOT NULL,
  	"profile" jsonb,
  	"merge_state" "enum_contacts_merge_state" DEFAULT 'clear',
  	"merged_into_id" uuid,
  	"retention_mode" "enum_contacts_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_contacts_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "organizations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"domain" varchar,
  	"status" "enum_organizations_status" DEFAULT 'lead' NOT NULL,
  	"metadata" jsonb,
  	"retention_mode" "enum_organizations_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_organizations_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "relationship_records" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"contact_id" uuid NOT NULL,
  	"organization_id" uuid,
  	"role" varchar,
  	"related" jsonb,
  	"context" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contact_tags" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"color" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contact_taggings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"contact_id" uuid NOT NULL,
  	"tag_id" uuid NOT NULL,
  	"source" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "interaction_records" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"contact_id" uuid,
  	"organization_id" uuid,
  	"kind" "enum_interaction_records_kind" DEFAULT 'form' NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"summary" varchar,
  	"references" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "relationship_notes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"contact_id" uuid,
  	"organization_id" uuid,
  	"body" varchar NOT NULL,
  	"private" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "deals_opportunities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"contact_id" uuid,
  	"organization_id" uuid,
  	"campaign_id" uuid,
  	"title" varchar NOT NULL,
  	"stage" "enum_deals_opportunities_stage" DEFAULT 'new' NOT NULL,
  	"amount" numeric,
  	"currency" varchar DEFAULT 'USD',
  	"owner_assignment_id" uuid,
  	"next_action_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "owner_assignments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"assignee_id" uuid,
  	"subject" jsonb NOT NULL,
  	"assigned_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "next_actions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"due_at" timestamp(3) with time zone,
  	"status" "enum_next_actions_status" DEFAULT 'open' NOT NULL,
  	"subject" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "workflow_items" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"type" "enum_workflow_items_type" DEFAULT 'custom' NOT NULL,
  	"status" "enum_workflow_items_status" DEFAULT 'open' NOT NULL,
  	"priority" "enum_workflow_items_priority" DEFAULT 'normal' NOT NULL,
  	"assignee_id" uuid,
  	"starts_at" timestamp(3) with time zone,
  	"due_at" timestamp(3) with time zone,
  	"checklist" jsonb DEFAULT '[]'::jsonb,
  	"comments" jsonb DEFAULT '[]'::jsonb,
  	"source_references" jsonb,
  	"outcome" jsonb,
  	"audit" jsonb DEFAULT '[]'::jsonb,
  	"calendar_entry_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "workflow_items_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid,
  	"media_assets_id" uuid,
  	"workflow_items_id" uuid
  );
  
  CREATE TABLE "audience_lists" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"status" "enum_audience_lists_status" DEFAULT 'active' NOT NULL,
  	"double_opt_in" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audience_segments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"definition" jsonb NOT NULL,
  	"consent_basis_required" boolean DEFAULT true,
  	"status" "enum_audience_segments_status" DEFAULT 'active' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audience_memberships" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"subscriber_id" uuid NOT NULL,
  	"audience_list_id" uuid NOT NULL,
  	"status" "enum_audience_memberships_status" DEFAULT 'pending' NOT NULL,
  	"confirmed_at" timestamp(3) with time zone,
  	"source" varchar DEFAULT 'form' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subscriber_confirmation_tokens" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"subscriber_id" uuid NOT NULL,
  	"audience_list_id" uuid,
  	"token_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"used_at" timestamp(3) with time zone,
  	"locale" varchar NOT NULL,
  	"consent_wording" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subscribers" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"email" varchar NOT NULL,
  	"email_hash" varchar NOT NULL,
  	"member_id" uuid,
  	"contact_id" uuid,
  	"status" "enum_subscribers_status" DEFAULT 'pending' NOT NULL,
  	"verified_at" timestamp(3) with time zone,
  	"global_unsubscribed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "consent_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"subscriber_id" uuid,
  	"contact_id" uuid,
  	"form_submission_id" uuid,
  	"audience_list_id" uuid,
  	"event" "enum_consent_events_event" DEFAULT 'requested' NOT NULL,
  	"basis" varchar NOT NULL,
  	"wording" varchar,
  	"locale" varchar,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"evidence" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"subscriber_id" uuid NOT NULL,
  	"audience_list_id" uuid,
  	"preferences" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "suppressions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"email_hash" varchar NOT NULL,
  	"reason" "enum_suppressions_reason" DEFAULT 'unsubscribe' NOT NULL,
  	"provider" varchar,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"global" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_messages" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"subject" varchar NOT NULL,
  	"blocks" jsonb NOT NULL,
  	"kind" "enum_email_messages_kind" NOT NULL,
  	"status" "enum_email_messages_status" DEFAULT 'draft' NOT NULL,
  	"scheduled_for" timestamp(3) with time zone,
  	"idempotency_key" varchar,
  	"tracking" jsonb,
  	"audience" jsonb,
  	"reviewed_at" timestamp(3) with time zone,
  	"cancel_cutoff_at" timestamp(3) with time zone,
  	"translation_project" varchar,
  	"locale_completeness" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_identities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"email_hash" varchar NOT NULL,
  	"provider" varchar NOT NULL,
  	"provider_recipient_id" varchar,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_deliveries" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"message_id" uuid NOT NULL,
  	"subscriber_id" uuid,
  	"recipient_email" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"status" "enum_email_deliveries_status" DEFAULT 'queued' NOT NULL,
  	"provider" varchar,
  	"provider_message_id" varchar,
  	"attempts" numeric DEFAULT 0,
  	"outcome" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "activity_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"type" varchar NOT NULL,
  	"actor" jsonb,
  	"object" jsonb,
  	"payload" jsonb,
  	"visibility_snapshot" jsonb,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notifications" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"activity_event_id" uuid NOT NULL,
  	"recipient_member_id" uuid NOT NULL,
  	"status" "enum_notifications_status" DEFAULT 'unread' NOT NULL,
  	"channels" jsonb NOT NULL,
  	"read_at" timestamp(3) with time zone,
  	"muted_until" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notification_preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"rules" jsonb NOT NULL,
  	"quiet_hours" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notification_channels" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"kind" "enum_notification_channels_kind" DEFAULT 'in-app' NOT NULL,
  	"address" varchar,
  	"enabled" boolean DEFAULT true,
  	"verified_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "digest_definitions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"member_id" uuid,
  	"name" varchar NOT NULL,
  	"filters" jsonb NOT NULL,
  	"cadence" "enum_digest_definitions_cadence" DEFAULT 'weekly' NOT NULL,
  	"channels" jsonb NOT NULL,
  	"template" jsonb,
  	"review_required" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "digest_runs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"definition_id" uuid NOT NULL,
  	"source_event_ids" jsonb NOT NULL,
  	"frozen_at" timestamp(3) with time zone NOT NULL,
  	"status" "enum_digest_runs_status" DEFAULT 'draft' NOT NULL,
  	"outcome" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_receipts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"delivery_id" uuid,
  	"notification_id" uuid,
  	"channel" "enum_delivery_receipts_channel" DEFAULT 'in-app' NOT NULL,
  	"status" "enum_delivery_receipts_status" DEFAULT 'queued' NOT NULL,
  	"provider_event" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "automation_definitions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"status" "enum_automation_definitions_status" DEFAULT 'draft' NOT NULL,
  	"trigger" jsonb NOT NULL,
  	"conditions" jsonb DEFAULT '[]'::jsonb,
  	"actions" jsonb NOT NULL,
  	"requires_approval" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analytics_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"event_id" varchar NOT NULL,
  	"dedupe_key" varchar NOT NULL,
  	"event_type" varchar NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"schema_version" numeric DEFAULT 1 NOT NULL,
  	"consent_basis" "enum_analytics_events_consent_basis" NOT NULL,
  	"anonymous_hash" varchar,
  	"session_hash" varchar,
  	"member_id" uuid,
  	"context" jsonb NOT NULL,
  	"properties" jsonb,
  	"trusted" boolean DEFAULT false,
  	"retention_mode" "enum_analytics_events_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_analytics_events_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analytics_rollups" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"metric" varchar NOT NULL,
  	"definition" varchar NOT NULL,
  	"grain" "enum_analytics_rollups_grain" NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"window_end" timestamp(3) with time zone NOT NULL,
  	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"value" varchar NOT NULL,
  	"unique_count_method" varchar,
  	"schema_version" numeric DEFAULT 1 NOT NULL,
  	"late_events_included_until" timestamp(3) with time zone,
  	"retention_mode" "enum_analytics_rollups_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_analytics_rollups_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "metric_snapshots" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"metric" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"definition" varchar NOT NULL,
  	"provider" varchar,
  	"grain" "enum_metric_snapshots_grain" NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"window_end" timestamp(3) with time zone NOT NULL,
  	"financial" jsonb,
  	"reconciliation_status" "enum_metric_snapshots_reconciliation_status" NOT NULL,
  	"source_reference" varchar,
  	"retention_mode" "enum_metric_snapshots_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_metric_snapshots_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analytics_goals" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"event_types" jsonb NOT NULL,
  	"definition" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "command_center_preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"hidden_sections" jsonb DEFAULT '[]'::jsonb,
  	"section_order" jsonb DEFAULT '[]'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experience_rules" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"status" "enum_experience_rules_status" DEFAULT 'draft' NOT NULL,
  	"approved_by_id" uuid,
  	"approved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experience_variants" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"rule_id" uuid NOT NULL,
  	"name" varchar NOT NULL,
  	"registered_component" varchar NOT NULL,
  	"content_revision_id" uuid,
  	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"status" "enum_experience_variants_status" DEFAULT 'draft' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"rule_id" uuid,
  	"conversion_goal_id" uuid,
  	"state" "enum_experiments_state" DEFAULT 'draft' NOT NULL,
  	"assignment_salt" varchar NOT NULL,
  	"collection_enabled" boolean DEFAULT true,
  	"approved_by_id" uuid,
  	"approved_at" timestamp(3) with time zone,
  	"started_at" timestamp(3) with time zone,
  	"stopped_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_variants" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"experience_variant_id" uuid,
  	"name" varchar NOT NULL,
  	"is_control" boolean DEFAULT false,
  	"allocation" numeric NOT NULL,
  	"registered_component" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "traffic_allocations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"allocation" numeric NOT NULL,
  	"effective_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_assignments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"subject_key" varchar NOT NULL,
  	"dedupe_key" varchar NOT NULL,
  	"consent_basis" varchar NOT NULL,
  	"assigned_at" timestamp(3) with time zone NOT NULL,
  	"is_default" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "conversion_goals" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"event_types" jsonb NOT NULL,
  	"definition" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"variant_id" uuid NOT NULL,
  	"assignment_id" uuid,
  	"kind" "enum_experiment_events_kind" DEFAULT 'exposure' NOT NULL,
  	"goal_key" varchar,
  	"dedupe_key" varchar NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"consent_basis" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_analyses" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"computed_at" timestamp(3) with time zone NOT NULL,
  	"result" jsonb NOT NULL,
  	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "experiment_decisions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"experiment_id" uuid NOT NULL,
  	"selected_variant_id" uuid,
  	"decision" "enum_experiment_decisions_decision" DEFAULT 'inconclusive' NOT NULL,
  	"reason" varchar NOT NULL,
  	"actor_id" uuid NOT NULL,
  	"decided_at" timestamp(3) with time zone NOT NULL,
  	"approval_required" boolean DEFAULT true,
  	"approved_by_id" uuid,
  	"approved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_policies" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"name" varchar NOT NULL,
  	"status" "enum_quality_policies_status" DEFAULT 'draft' NOT NULL,
  	"release_checks_required" boolean DEFAULT true,
  	"rules" jsonb DEFAULT '[]'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_rules" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"policy_id" uuid,
  	"key" varchar NOT NULL,
  	"producer" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"severity" "enum_quality_rules_severity" DEFAULT 'warning' NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"configuration" jsonb DEFAULT '{}'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_scans" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"policy_id" uuid,
  	"target_type" "enum_quality_scans_target_type" DEFAULT 'document' NOT NULL,
  	"target_id" varchar NOT NULL,
  	"revision_id" varchar,
  	"status" "enum_quality_scans_status" DEFAULT 'queued' NOT NULL,
  	"started_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"summary" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_issues" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"scan_id" uuid,
  	"rule_id" uuid,
  	"dedupe_key" varchar NOT NULL,
  	"revision_id" varchar,
  	"target_type" varchar NOT NULL,
  	"target_id" varchar NOT NULL,
  	"surface" varchar,
  	"severity" "enum_quality_issues_severity" DEFAULT 'warning' NOT NULL,
  	"status" "enum_quality_issues_status" DEFAULT 'open' NOT NULL,
  	"message" varchar NOT NULL,
  	"remediation" jsonb,
  	"owner_id" uuid,
  	"first_seen_at" timestamp(3) with time zone NOT NULL,
  	"resolved_at" timestamp(3) with time zone,
  	"dependency_fingerprint" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_exceptions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"rule_id" uuid NOT NULL,
  	"target_type" varchar NOT NULL,
  	"target_id" varchar NOT NULL,
  	"reason" varchar NOT NULL,
  	"actor_id" uuid NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_waivers" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"issue_id" uuid NOT NULL,
  	"reason" varchar NOT NULL,
  	"actor_id" uuid NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"authorized_by_id" uuid NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quality_reports" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"scan_id" uuid NOT NULL,
  	"report" jsonb NOT NULL,
  	"generated_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "merchant_connections" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"label" varchar NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"merchant_country" varchar NOT NULL,
  	"status" "enum_merchant_connections_status" DEFAULT 'active' NOT NULL,
  	"credential_reference" varchar,
  	"configuration" jsonb DEFAULT '{}'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_method_capabilities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"merchant_connection_id" uuid NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"rail_key" varchar NOT NULL,
  	"family" "enum_payment_method_capabilities_family" NOT NULL,
  	"flow" "enum_payment_method_capabilities_flow" NOT NULL,
  	"merchant_countries" jsonb DEFAULT '[]'::jsonb,
  	"buyer_countries" jsonb DEFAULT '[]'::jsonb,
  	"presentment_currencies" jsonb DEFAULT '[]'::jsonb,
  	"settlement_currencies" jsonb DEFAULT '[]'::jsonb,
  	"minimum_amount_minor" varchar,
  	"maximum_amount_minor" varchar,
  	"recurring" boolean DEFAULT false,
  	"refunds" boolean DEFAULT false,
  	"enabled" boolean DEFAULT true,
  	"health" "enum_payment_method_capabilities_health" DEFAULT 'healthy' NOT NULL,
  	"required_customer_fields" jsonb DEFAULT '[]'::jsonb,
  	"instructions" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"attributes" jsonb DEFAULT '{}'::jsonb,
  	"inventory_policy" "enum_products_variants_inventory_policy" DEFAULT 'untracked',
  	"inventory_quantity" numeric,
  	"inventory_reference" varchar,
  	"pod_reference" jsonb
  );
  
  CREATE TABLE "products_prices" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"currency" varchar NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"compare_at_minor" varchar,
  	"variant_sku" varchar,
  	"recurring_interval" "enum_products_prices_recurring_interval"
  );
  
  CREATE TABLE "products" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"merchant_connection_id" uuid NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"canonical_path" varchar NOT NULL,
  	"kind" "enum_products_kind" NOT NULL,
  	"state" "enum_products_state" DEFAULT 'draft' NOT NULL,
  	"description" varchar,
  	"localized" jsonb DEFAULT '{}'::jsonb,
  	"categories_id" uuid,
  	"entitlement" varchar,
  	"release_revision" varchar,
  	"retention_mode" "enum_products_retention_mode" DEFAULT 'permanent' NOT NULL,
  	"retention_expires_at" timestamp(3) with time zone,
  	"retention_hold" "enum_products_retention_hold" DEFAULT 'none' NOT NULL,
  	"remove_from_discovery" boolean DEFAULT true,
  	"tombstone_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"albums_id" uuid,
  	"media_assets_id" uuid
  );
  
  CREATE TABLE "carts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"merchant_connection_id" uuid NOT NULL,
  	"currency" varchar NOT NULL,
  	"buyer_country" varchar,
  	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"state" "enum_carts_state" DEFAULT 'active' NOT NULL,
  	"idempotency_key" varchar,
  	"expires_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "checkout_sessions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"cart_id" uuid NOT NULL,
  	"merchant_connection_id" uuid NOT NULL,
  	"currency" varchar NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"buyer_country" varchar,
  	"state" "enum_checkout_sessions_state" DEFAULT 'open' NOT NULL,
  	"selected_capability_id" varchar,
  	"legal_copy" jsonb DEFAULT '{}'::jsonb,
  	"idempotency_key" varchar,
  	"expires_at" timestamp(3) with time zone,
  	"shipping_extension" jsonb,
  	"tax_extension" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_intents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"checkout_session_id" uuid NOT NULL,
  	"merchant_connection_id" uuid NOT NULL,
  	"capability_id" varchar NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"currency" varchar NOT NULL,
  	"state" "enum_payment_intents_state" DEFAULT 'created' NOT NULL,
  	"provider_reference" varchar,
  	"crypto_invoice" jsonb,
  	"exception" jsonb,
  	"financial_events" jsonb DEFAULT '[]'::jsonb,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"checkout_session_id" uuid NOT NULL,
  	"merchant_connection_id" uuid NOT NULL,
  	"order_number" varchar NOT NULL,
  	"state" "enum_orders_state" NOT NULL,
  	"currency" varchar NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"items" jsonb NOT NULL,
  	"transition_log" jsonb DEFAULT '[]'::jsonb,
  	"refund_extension" jsonb,
  	"receipt" jsonb,
  	"fulfillment_extension" jsonb,
  	"exception" jsonb,
  	"pos_metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_webhook_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"merchant_connection_id" uuid NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"provider_event_id" varchar NOT NULL,
  	"payload_hash" varchar NOT NULL,
  	"verified_at" timestamp(3) with time zone NOT NULL,
  	"processed_at" timestamp(3) with time zone,
  	"outcome" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "supporters" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"display_name" varchar,
  	"member_id" uuid,
  	"email_hash" varchar,
  	"provider_references" jsonb DEFAULT '[]'::jsonb,
  	"visibility_preference" "enum_supporters_visibility_preference" DEFAULT 'public',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "entitlements" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_id" uuid NOT NULL,
  	"publication_id" uuid,
  	"space_id" uuid,
  	"owner_id" uuid,
  	"supporter_id" uuid NOT NULL,
  	"campaign_id" uuid,
  	"payment_intent_id" uuid,
  	"entitlement" varchar NOT NULL,
  	"source" varchar NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"fulfillment_reference" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "rights_status" "enum_media_assets_rights_status" DEFAULT 'approved';
  ALTER TABLE "media_usages_rels" ADD COLUMN "email_messages_id" uuid;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "site_id" uuid NOT NULL;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "space_id" uuid;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "template" varchar;
  ALTER TABLE "graphic_documents" ADD COLUMN IF NOT EXISTS "layout_variant" varchar;
  ALTER TABLE "campaigns" ADD COLUMN "visibility" "enum_campaigns_visibility" DEFAULT 'public' NOT NULL;
  ALTER TABLE "campaigns" ADD COLUMN "start_at" timestamp(3) with time zone;
  ALTER TABLE "campaigns" ADD COLUMN "end_at" timestamp(3) with time zone;
  ALTER TABLE "campaigns" ADD COLUMN "goal" jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "milestones" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "updates" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "tiers" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "progress" jsonb DEFAULT '{"raisedMinor":"0","supporterCount":0,"history":[]}'::jsonb;
  ALTER TABLE "campaigns" ADD COLUMN "calendar_entry_id" uuid;
  ALTER TABLE "campaigns" ADD COLUMN "supporter_visibility" "enum_campaigns_supporter_visibility" DEFAULT 'aggregate';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "content_releases_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_definitions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_schemas_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_submissions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "submission_attachments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "contacts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organizations_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "relationship_records_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "contact_tags_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "contact_taggings_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "interaction_records_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "relationship_notes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "deals_opportunities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "owner_assignments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "next_actions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "workflow_items_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audience_lists_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audience_segments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audience_memberships_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscriber_confirmation_tokens_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscribers_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consent_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "preferences_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "suppressions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_messages_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "delivery_identities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_deliveries_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "activity_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notifications_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notification_preferences_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notification_channels_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "digest_definitions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "digest_runs_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "delivery_receipts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "automation_definitions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "analytics_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "analytics_rollups_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "metric_snapshots_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "analytics_goals_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "command_center_preferences_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experience_rules_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experience_variants_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_variants_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "traffic_allocations_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_assignments_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "conversion_goals_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_analyses_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiment_decisions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_policies_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_rules_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_scans_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_issues_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_exceptions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_waivers_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quality_reports_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "merchant_connections_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_method_capabilities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "products_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "carts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "checkout_sessions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_intents_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "orders_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_webhook_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "supporters_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "entitlements_id" uuid;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_article_id_article_family_content_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article_family_content"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_active_schema_id_form_schemas_id_fk" FOREIGN KEY ("active_schema_id") REFERENCES "public"."form_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_schemas" ADD CONSTRAINT "form_schemas_form_id_form_definitions_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definitions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_form_definitions_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definitions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_schema_id_form_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."form_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_workflow_item_id_workflow_items_id_fk" FOREIGN KEY ("workflow_item_id") REFERENCES "public"."workflow_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submission_id_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_merged_into_id_contacts_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_records" ADD CONSTRAINT "relationship_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_taggings" ADD CONSTRAINT "contact_taggings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_taggings" ADD CONSTRAINT "contact_taggings_tag_id_contact_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."contact_tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interaction_records" ADD CONSTRAINT "interaction_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_owner_assignment_id_owner_assignments_id_fk" FOREIGN KEY ("owner_assignment_id") REFERENCES "public"."owner_assignments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deals_opportunities" ADD CONSTRAINT "deals_opportunities_next_action_id_next_actions_id_fk" FOREIGN KEY ("next_action_id") REFERENCES "public"."next_actions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items" ADD CONSTRAINT "workflow_items_calendar_entry_id_calendar_entries_id_fk" FOREIGN KEY ("calendar_entry_id") REFERENCES "public"."calendar_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflow_items_rels" ADD CONSTRAINT "workflow_items_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."workflow_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "workflow_items_rels" ADD CONSTRAINT "workflow_items_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "workflow_items_rels" ADD CONSTRAINT "workflow_items_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "workflow_items_rels" ADD CONSTRAINT "workflow_items_rels_workflow_items_fk" FOREIGN KEY ("workflow_items_id") REFERENCES "public"."workflow_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "audience_lists" ADD CONSTRAINT "audience_lists_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_lists" ADD CONSTRAINT "audience_lists_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_lists" ADD CONSTRAINT "audience_lists_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_lists" ADD CONSTRAINT "audience_lists_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_memberships" ADD CONSTRAINT "audience_memberships_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audience_memberships" ADD CONSTRAINT "audience_memberships_audience_list_id_audience_lists_id_fk" FOREIGN KEY ("audience_list_id") REFERENCES "public"."audience_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscriber_confirmation_tokens" ADD CONSTRAINT "subscriber_confirmation_tokens_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscriber_confirmation_tokens" ADD CONSTRAINT "subscriber_confirmation_tokens_audience_list_id_audience_lists_id_fk" FOREIGN KEY ("audience_list_id") REFERENCES "public"."audience_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_form_submission_id_form_submissions_id_fk" FOREIGN KEY ("form_submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_audience_list_id_audience_lists_id_fk" FOREIGN KEY ("audience_list_id") REFERENCES "public"."audience_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "preferences" ADD CONSTRAINT "preferences_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "preferences" ADD CONSTRAINT "preferences_audience_list_id_audience_lists_id_fk" FOREIGN KEY ("audience_list_id") REFERENCES "public"."audience_lists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_identities" ADD CONSTRAINT "delivery_identities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_identities" ADD CONSTRAINT "delivery_identities_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_identities" ADD CONSTRAINT "delivery_identities_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_identities" ADD CONSTRAINT "delivery_identities_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_activity_event_id_activity_events_id_fk" FOREIGN KEY ("activity_event_id") REFERENCES "public"."activity_events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_member_id_members_id_fk" FOREIGN KEY ("recipient_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_definitions" ADD CONSTRAINT "digest_definitions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "digest_runs" ADD CONSTRAINT "digest_runs_definition_id_digest_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."digest_definitions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_delivery_id_email_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."email_deliveries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "automation_definitions" ADD CONSTRAINT "automation_definitions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "automation_definitions" ADD CONSTRAINT "automation_definitions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "automation_definitions" ADD CONSTRAINT "automation_definitions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "automation_definitions" ADD CONSTRAINT "automation_definitions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_rollups" ADD CONSTRAINT "analytics_rollups_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "command_center_preferences" ADD CONSTRAINT "command_center_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_rules" ADD CONSTRAINT "experience_rules_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_rule_id_experience_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."experience_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experience_variants" ADD CONSTRAINT "experience_variants_content_revision_id_revision_records_id_fk" FOREIGN KEY ("content_revision_id") REFERENCES "public"."revision_records"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_rule_id_experience_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."experience_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_conversion_goal_id_conversion_goals_id_fk" FOREIGN KEY ("conversion_goal_id") REFERENCES "public"."conversion_goals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experience_variant_id_experience_variants_id_fk" FOREIGN KEY ("experience_variant_id") REFERENCES "public"."experience_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "traffic_allocations" ADD CONSTRAINT "traffic_allocations_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversion_goals" ADD CONSTRAINT "conversion_goals_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_assignment_id_experiment_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."experiment_assignments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_selected_variant_id_experiment_variants_id_fk" FOREIGN KEY ("selected_variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiment_decisions" ADD CONSTRAINT "experiment_decisions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_policies" ADD CONSTRAINT "quality_policies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_policies" ADD CONSTRAINT "quality_policies_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_policies" ADD CONSTRAINT "quality_policies_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_policies" ADD CONSTRAINT "quality_policies_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_rules" ADD CONSTRAINT "quality_rules_policy_id_quality_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."quality_policies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_policy_id_quality_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."quality_policies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_scan_id_quality_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."quality_scans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_rule_id_quality_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."quality_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_rule_id_quality_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."quality_rules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_exceptions" ADD CONSTRAINT "quality_exceptions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_issue_id_quality_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."quality_issues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_waivers" ADD CONSTRAINT "quality_waivers_authorized_by_id_users_id_fk" FOREIGN KEY ("authorized_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_scan_id_quality_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."quality_scans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_method_capabilities" ADD CONSTRAINT "payment_method_capabilities_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_variants" ADD CONSTRAINT "products_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_prices" ADD CONSTRAINT "products_prices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_categories_id_categories_id_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_merchant_connection_id_merchant_connections_id_fk" FOREIGN KEY ("merchant_connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supporters" ADD CONSTRAINT "supporters_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_supporter_id_supporters_id_fk" FOREIGN KEY ("supporter_id") REFERENCES "public"."supporters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "content_releases_site_idx" ON "content_releases" USING btree ("site_id");
  CREATE INDEX "content_releases_publication_idx" ON "content_releases" USING btree ("publication_id");
  CREATE INDEX "content_releases_space_idx" ON "content_releases" USING btree ("space_id");
  CREATE INDEX "content_releases_owner_idx" ON "content_releases" USING btree ("owner_id");
  CREATE INDEX "content_releases_content_idx" ON "content_releases" USING btree ("content_id");
  CREATE INDEX "content_releases_article_idx" ON "content_releases" USING btree ("article_id");
  CREATE INDEX "content_releases_product_idx" ON "content_releases" USING btree ("product_id");
  CREATE INDEX IF NOT EXISTS "content_releases_scheduled_for_idx" ON "content_releases" USING btree ("scheduled_for");
  CREATE INDEX "content_releases_updated_at_idx" ON "content_releases" USING btree ("updated_at");
  CREATE INDEX "content_releases_created_at_idx" ON "content_releases" USING btree ("created_at");
  CREATE INDEX "form_definitions_site_idx" ON "form_definitions" USING btree ("site_id");
  CREATE INDEX "form_definitions_publication_idx" ON "form_definitions" USING btree ("publication_id");
  CREATE INDEX "form_definitions_space_idx" ON "form_definitions" USING btree ("space_id");
  CREATE INDEX "form_definitions_owner_idx" ON "form_definitions" USING btree ("owner_id");
  CREATE UNIQUE INDEX "form_definitions_public_path_idx" ON "form_definitions" USING btree ("public_path");
  CREATE INDEX "form_definitions_active_schema_idx" ON "form_definitions" USING btree ("active_schema_id");
  CREATE INDEX "form_definitions_updated_at_idx" ON "form_definitions" USING btree ("updated_at");
  CREATE INDEX "form_definitions_created_at_idx" ON "form_definitions" USING btree ("created_at");
  CREATE INDEX "form_schemas_form_idx" ON "form_schemas" USING btree ("form_id");
  CREATE INDEX "form_schemas_updated_at_idx" ON "form_schemas" USING btree ("updated_at");
  CREATE INDEX "form_schemas_created_at_idx" ON "form_schemas" USING btree ("created_at");
  CREATE UNIQUE INDEX "form_version_idx" ON "form_schemas" USING btree ("form_id","version");
  CREATE INDEX "form_submissions_site_idx" ON "form_submissions" USING btree ("site_id");
  CREATE INDEX "form_submissions_publication_idx" ON "form_submissions" USING btree ("publication_id");
  CREATE INDEX "form_submissions_space_idx" ON "form_submissions" USING btree ("space_id");
  CREATE INDEX "form_submissions_owner_idx" ON "form_submissions" USING btree ("owner_id");
  CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id");
  CREATE INDEX "form_submissions_schema_idx" ON "form_submissions" USING btree ("schema_id");
  CREATE INDEX "form_submissions_contact_idx" ON "form_submissions" USING btree ("contact_id");
  CREATE INDEX "form_submissions_organization_idx" ON "form_submissions" USING btree ("organization_id");
  CREATE INDEX "form_submissions_workflow_item_idx" ON "form_submissions" USING btree ("workflow_item_id");
  CREATE INDEX "form_submissions_idempotency_key_idx" ON "form_submissions" USING btree ("idempotency_key");
  CREATE INDEX "form_submissions_updated_at_idx" ON "form_submissions" USING btree ("updated_at");
  CREATE INDEX "form_submissions_created_at_idx" ON "form_submissions" USING btree ("created_at");
  CREATE INDEX "submission_attachments_submission_idx" ON "submission_attachments" USING btree ("submission_id");
  CREATE INDEX "submission_attachments_media_idx" ON "submission_attachments" USING btree ("media_id");
  CREATE INDEX "submission_attachments_updated_at_idx" ON "submission_attachments" USING btree ("updated_at");
  CREATE INDEX "submission_attachments_created_at_idx" ON "submission_attachments" USING btree ("created_at");
  CREATE INDEX "contacts_site_idx" ON "contacts" USING btree ("site_id");
  CREATE INDEX "contacts_publication_idx" ON "contacts" USING btree ("publication_id");
  CREATE INDEX "contacts_space_idx" ON "contacts" USING btree ("space_id");
  CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("owner_id");
  CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");
  CREATE INDEX "contacts_email_hash_idx" ON "contacts" USING btree ("email_hash");
  CREATE INDEX "contacts_member_idx" ON "contacts" USING btree ("member_id");
  CREATE INDEX "contacts_merged_into_idx" ON "contacts" USING btree ("merged_into_id");
  CREATE INDEX "contacts_updated_at_idx" ON "contacts" USING btree ("updated_at");
  CREATE INDEX "contacts_created_at_idx" ON "contacts" USING btree ("created_at");
  CREATE INDEX "organizations_site_idx" ON "organizations" USING btree ("site_id");
  CREATE INDEX "organizations_publication_idx" ON "organizations" USING btree ("publication_id");
  CREATE INDEX "organizations_space_idx" ON "organizations" USING btree ("space_id");
  CREATE INDEX "organizations_owner_idx" ON "organizations" USING btree ("owner_id");
  CREATE INDEX "organizations_domain_idx" ON "organizations" USING btree ("domain");
  CREATE INDEX "organizations_updated_at_idx" ON "organizations" USING btree ("updated_at");
  CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");
  CREATE INDEX "relationship_records_site_idx" ON "relationship_records" USING btree ("site_id");
  CREATE INDEX "relationship_records_publication_idx" ON "relationship_records" USING btree ("publication_id");
  CREATE INDEX "relationship_records_space_idx" ON "relationship_records" USING btree ("space_id");
  CREATE INDEX "relationship_records_owner_idx" ON "relationship_records" USING btree ("owner_id");
  CREATE INDEX "relationship_records_contact_idx" ON "relationship_records" USING btree ("contact_id");
  CREATE INDEX "relationship_records_organization_idx" ON "relationship_records" USING btree ("organization_id");
  CREATE INDEX "relationship_records_updated_at_idx" ON "relationship_records" USING btree ("updated_at");
  CREATE INDEX "relationship_records_created_at_idx" ON "relationship_records" USING btree ("created_at");
  CREATE INDEX "contact_tags_site_idx" ON "contact_tags" USING btree ("site_id");
  CREATE INDEX "contact_tags_publication_idx" ON "contact_tags" USING btree ("publication_id");
  CREATE INDEX "contact_tags_space_idx" ON "contact_tags" USING btree ("space_id");
  CREATE INDEX "contact_tags_owner_idx" ON "contact_tags" USING btree ("owner_id");
  CREATE INDEX "contact_tags_updated_at_idx" ON "contact_tags" USING btree ("updated_at");
  CREATE INDEX "contact_tags_created_at_idx" ON "contact_tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_name_idx" ON "contact_tags" USING btree ("site_id","name");
  CREATE INDEX "contact_taggings_contact_idx" ON "contact_taggings" USING btree ("contact_id");
  CREATE INDEX "contact_taggings_tag_idx" ON "contact_taggings" USING btree ("tag_id");
  CREATE INDEX "contact_taggings_updated_at_idx" ON "contact_taggings" USING btree ("updated_at");
  CREATE INDEX "contact_taggings_created_at_idx" ON "contact_taggings" USING btree ("created_at");
  CREATE UNIQUE INDEX "contact_tag_idx" ON "contact_taggings" USING btree ("contact_id","tag_id");
  CREATE INDEX "interaction_records_site_idx" ON "interaction_records" USING btree ("site_id");
  CREATE INDEX "interaction_records_publication_idx" ON "interaction_records" USING btree ("publication_id");
  CREATE INDEX "interaction_records_space_idx" ON "interaction_records" USING btree ("space_id");
  CREATE INDEX "interaction_records_owner_idx" ON "interaction_records" USING btree ("owner_id");
  CREATE INDEX "interaction_records_contact_idx" ON "interaction_records" USING btree ("contact_id");
  CREATE INDEX "interaction_records_organization_idx" ON "interaction_records" USING btree ("organization_id");
  CREATE INDEX "interaction_records_updated_at_idx" ON "interaction_records" USING btree ("updated_at");
  CREATE INDEX "interaction_records_created_at_idx" ON "interaction_records" USING btree ("created_at");
  CREATE INDEX "relationship_notes_site_idx" ON "relationship_notes" USING btree ("site_id");
  CREATE INDEX "relationship_notes_publication_idx" ON "relationship_notes" USING btree ("publication_id");
  CREATE INDEX "relationship_notes_space_idx" ON "relationship_notes" USING btree ("space_id");
  CREATE INDEX "relationship_notes_owner_idx" ON "relationship_notes" USING btree ("owner_id");
  CREATE INDEX "relationship_notes_contact_idx" ON "relationship_notes" USING btree ("contact_id");
  CREATE INDEX "relationship_notes_organization_idx" ON "relationship_notes" USING btree ("organization_id");
  CREATE INDEX "relationship_notes_updated_at_idx" ON "relationship_notes" USING btree ("updated_at");
  CREATE INDEX "relationship_notes_created_at_idx" ON "relationship_notes" USING btree ("created_at");
  CREATE INDEX "deals_opportunities_site_idx" ON "deals_opportunities" USING btree ("site_id");
  CREATE INDEX "deals_opportunities_publication_idx" ON "deals_opportunities" USING btree ("publication_id");
  CREATE INDEX "deals_opportunities_space_idx" ON "deals_opportunities" USING btree ("space_id");
  CREATE INDEX "deals_opportunities_owner_idx" ON "deals_opportunities" USING btree ("owner_id");
  CREATE INDEX "deals_opportunities_contact_idx" ON "deals_opportunities" USING btree ("contact_id");
  CREATE INDEX "deals_opportunities_organization_idx" ON "deals_opportunities" USING btree ("organization_id");
  CREATE INDEX "deals_opportunities_campaign_idx" ON "deals_opportunities" USING btree ("campaign_id");
  CREATE INDEX "deals_opportunities_owner_assignment_idx" ON "deals_opportunities" USING btree ("owner_assignment_id");
  CREATE INDEX "deals_opportunities_next_action_idx" ON "deals_opportunities" USING btree ("next_action_id");
  CREATE INDEX "deals_opportunities_updated_at_idx" ON "deals_opportunities" USING btree ("updated_at");
  CREATE INDEX "deals_opportunities_created_at_idx" ON "deals_opportunities" USING btree ("created_at");
  CREATE INDEX "owner_assignments_site_idx" ON "owner_assignments" USING btree ("site_id");
  CREATE INDEX "owner_assignments_publication_idx" ON "owner_assignments" USING btree ("publication_id");
  CREATE INDEX "owner_assignments_space_idx" ON "owner_assignments" USING btree ("space_id");
  CREATE INDEX "owner_assignments_owner_idx" ON "owner_assignments" USING btree ("owner_id");
  CREATE INDEX "owner_assignments_assignee_idx" ON "owner_assignments" USING btree ("assignee_id");
  CREATE INDEX "owner_assignments_updated_at_idx" ON "owner_assignments" USING btree ("updated_at");
  CREATE INDEX "owner_assignments_created_at_idx" ON "owner_assignments" USING btree ("created_at");
  CREATE INDEX "next_actions_site_idx" ON "next_actions" USING btree ("site_id");
  CREATE INDEX "next_actions_publication_idx" ON "next_actions" USING btree ("publication_id");
  CREATE INDEX "next_actions_space_idx" ON "next_actions" USING btree ("space_id");
  CREATE INDEX "next_actions_owner_idx" ON "next_actions" USING btree ("owner_id");
  CREATE INDEX "next_actions_updated_at_idx" ON "next_actions" USING btree ("updated_at");
  CREATE INDEX "next_actions_created_at_idx" ON "next_actions" USING btree ("created_at");
  CREATE INDEX "workflow_items_site_idx" ON "workflow_items" USING btree ("site_id");
  CREATE INDEX "workflow_items_publication_idx" ON "workflow_items" USING btree ("publication_id");
  CREATE INDEX "workflow_items_space_idx" ON "workflow_items" USING btree ("space_id");
  CREATE INDEX "workflow_items_owner_idx" ON "workflow_items" USING btree ("owner_id");
  CREATE INDEX "workflow_items_assignee_idx" ON "workflow_items" USING btree ("assignee_id");
  CREATE INDEX "workflow_items_calendar_entry_idx" ON "workflow_items" USING btree ("calendar_entry_id");
  CREATE INDEX "workflow_items_updated_at_idx" ON "workflow_items" USING btree ("updated_at");
  CREATE INDEX "workflow_items_created_at_idx" ON "workflow_items" USING btree ("created_at");
  CREATE INDEX "workflow_items_rels_order_idx" ON "workflow_items_rels" USING btree ("order");
  CREATE INDEX "workflow_items_rels_parent_idx" ON "workflow_items_rels" USING btree ("parent_id");
  CREATE INDEX "workflow_items_rels_path_idx" ON "workflow_items_rels" USING btree ("path");
  CREATE INDEX "workflow_items_rels_users_id_idx" ON "workflow_items_rels" USING btree ("users_id");
  CREATE INDEX "workflow_items_rels_media_assets_id_idx" ON "workflow_items_rels" USING btree ("media_assets_id");
  CREATE INDEX "workflow_items_rels_workflow_items_id_idx" ON "workflow_items_rels" USING btree ("workflow_items_id");
  CREATE INDEX "audience_lists_site_idx" ON "audience_lists" USING btree ("site_id");
  CREATE INDEX "audience_lists_publication_idx" ON "audience_lists" USING btree ("publication_id");
  CREATE INDEX "audience_lists_space_idx" ON "audience_lists" USING btree ("space_id");
  CREATE INDEX "audience_lists_owner_idx" ON "audience_lists" USING btree ("owner_id");
  CREATE INDEX "audience_lists_updated_at_idx" ON "audience_lists" USING btree ("updated_at");
  CREATE INDEX "audience_lists_created_at_idx" ON "audience_lists" USING btree ("created_at");
  CREATE INDEX "audience_segments_site_idx" ON "audience_segments" USING btree ("site_id");
  CREATE INDEX "audience_segments_publication_idx" ON "audience_segments" USING btree ("publication_id");
  CREATE INDEX "audience_segments_space_idx" ON "audience_segments" USING btree ("space_id");
  CREATE INDEX "audience_segments_owner_idx" ON "audience_segments" USING btree ("owner_id");
  CREATE INDEX "audience_segments_updated_at_idx" ON "audience_segments" USING btree ("updated_at");
  CREATE INDEX "audience_segments_created_at_idx" ON "audience_segments" USING btree ("created_at");
  CREATE INDEX "audience_memberships_subscriber_idx" ON "audience_memberships" USING btree ("subscriber_id");
  CREATE INDEX "audience_memberships_audience_list_idx" ON "audience_memberships" USING btree ("audience_list_id");
  CREATE INDEX "audience_memberships_updated_at_idx" ON "audience_memberships" USING btree ("updated_at");
  CREATE INDEX "audience_memberships_created_at_idx" ON "audience_memberships" USING btree ("created_at");
  CREATE UNIQUE INDEX "subscriber_audienceList_idx" ON "audience_memberships" USING btree ("subscriber_id","audience_list_id");
  CREATE INDEX "subscriber_confirmation_tokens_subscriber_idx" ON "subscriber_confirmation_tokens" USING btree ("subscriber_id");
  CREATE INDEX "subscriber_confirmation_tokens_audience_list_idx" ON "subscriber_confirmation_tokens" USING btree ("audience_list_id");
  CREATE UNIQUE INDEX "subscriber_confirmation_tokens_token_hash_idx" ON "subscriber_confirmation_tokens" USING btree ("token_hash");
  CREATE INDEX "subscriber_confirmation_tokens_updated_at_idx" ON "subscriber_confirmation_tokens" USING btree ("updated_at");
  CREATE INDEX "subscriber_confirmation_tokens_created_at_idx" ON "subscriber_confirmation_tokens" USING btree ("created_at");
  CREATE INDEX "subscribers_site_idx" ON "subscribers" USING btree ("site_id");
  CREATE INDEX "subscribers_publication_idx" ON "subscribers" USING btree ("publication_id");
  CREATE INDEX "subscribers_space_idx" ON "subscribers" USING btree ("space_id");
  CREATE INDEX "subscribers_owner_idx" ON "subscribers" USING btree ("owner_id");
  CREATE INDEX "subscribers_email_hash_idx" ON "subscribers" USING btree ("email_hash");
  CREATE INDEX "subscribers_member_idx" ON "subscribers" USING btree ("member_id");
  CREATE INDEX "subscribers_contact_idx" ON "subscribers" USING btree ("contact_id");
  CREATE INDEX "subscribers_updated_at_idx" ON "subscribers" USING btree ("updated_at");
  CREATE INDEX "subscribers_created_at_idx" ON "subscribers" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_emailHash_idx" ON "subscribers" USING btree ("site_id","email_hash");
  CREATE INDEX "consent_events_site_idx" ON "consent_events" USING btree ("site_id");
  CREATE INDEX "consent_events_publication_idx" ON "consent_events" USING btree ("publication_id");
  CREATE INDEX "consent_events_space_idx" ON "consent_events" USING btree ("space_id");
  CREATE INDEX "consent_events_owner_idx" ON "consent_events" USING btree ("owner_id");
  CREATE INDEX "consent_events_subscriber_idx" ON "consent_events" USING btree ("subscriber_id");
  CREATE INDEX "consent_events_contact_idx" ON "consent_events" USING btree ("contact_id");
  CREATE INDEX "consent_events_form_submission_idx" ON "consent_events" USING btree ("form_submission_id");
  CREATE INDEX "consent_events_audience_list_idx" ON "consent_events" USING btree ("audience_list_id");
  CREATE INDEX "consent_events_updated_at_idx" ON "consent_events" USING btree ("updated_at");
  CREATE INDEX "consent_events_created_at_idx" ON "consent_events" USING btree ("created_at");
  CREATE INDEX "preferences_subscriber_idx" ON "preferences" USING btree ("subscriber_id");
  CREATE INDEX "preferences_audience_list_idx" ON "preferences" USING btree ("audience_list_id");
  CREATE INDEX "preferences_updated_at_idx" ON "preferences" USING btree ("updated_at");
  CREATE INDEX "preferences_created_at_idx" ON "preferences" USING btree ("created_at");
  CREATE INDEX "suppressions_site_idx" ON "suppressions" USING btree ("site_id");
  CREATE INDEX "suppressions_publication_idx" ON "suppressions" USING btree ("publication_id");
  CREATE INDEX "suppressions_space_idx" ON "suppressions" USING btree ("space_id");
  CREATE INDEX "suppressions_owner_idx" ON "suppressions" USING btree ("owner_id");
  CREATE INDEX "suppressions_email_hash_idx" ON "suppressions" USING btree ("email_hash");
  CREATE INDEX "suppressions_updated_at_idx" ON "suppressions" USING btree ("updated_at");
  CREATE INDEX "suppressions_created_at_idx" ON "suppressions" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_emailHash_reason_idx" ON "suppressions" USING btree ("site_id","email_hash","reason");
  CREATE INDEX "email_messages_site_idx" ON "email_messages" USING btree ("site_id");
  CREATE INDEX "email_messages_publication_idx" ON "email_messages" USING btree ("publication_id");
  CREATE INDEX "email_messages_space_idx" ON "email_messages" USING btree ("space_id");
  CREATE INDEX "email_messages_owner_idx" ON "email_messages" USING btree ("owner_id");
  CREATE UNIQUE INDEX "email_messages_idempotency_key_idx" ON "email_messages" USING btree ("idempotency_key");
  CREATE INDEX "email_messages_updated_at_idx" ON "email_messages" USING btree ("updated_at");
  CREATE INDEX "email_messages_created_at_idx" ON "email_messages" USING btree ("created_at");
  CREATE INDEX "delivery_identities_site_idx" ON "delivery_identities" USING btree ("site_id");
  CREATE INDEX "delivery_identities_publication_idx" ON "delivery_identities" USING btree ("publication_id");
  CREATE INDEX "delivery_identities_space_idx" ON "delivery_identities" USING btree ("space_id");
  CREATE INDEX "delivery_identities_owner_idx" ON "delivery_identities" USING btree ("owner_id");
  CREATE INDEX "delivery_identities_email_hash_idx" ON "delivery_identities" USING btree ("email_hash");
  CREATE INDEX "delivery_identities_updated_at_idx" ON "delivery_identities" USING btree ("updated_at");
  CREATE INDEX "delivery_identities_created_at_idx" ON "delivery_identities" USING btree ("created_at");
  CREATE INDEX "email_deliveries_message_idx" ON "email_deliveries" USING btree ("message_id");
  CREATE INDEX "email_deliveries_subscriber_idx" ON "email_deliveries" USING btree ("subscriber_id");
  CREATE UNIQUE INDEX "email_deliveries_idempotency_key_idx" ON "email_deliveries" USING btree ("idempotency_key");
  CREATE INDEX "email_deliveries_updated_at_idx" ON "email_deliveries" USING btree ("updated_at");
  CREATE INDEX "email_deliveries_created_at_idx" ON "email_deliveries" USING btree ("created_at");
  CREATE INDEX "activity_events_site_idx" ON "activity_events" USING btree ("site_id");
  CREATE INDEX "activity_events_publication_idx" ON "activity_events" USING btree ("publication_id");
  CREATE INDEX "activity_events_space_idx" ON "activity_events" USING btree ("space_id");
  CREATE INDEX "activity_events_owner_idx" ON "activity_events" USING btree ("owner_id");
  CREATE INDEX "activity_events_type_idx" ON "activity_events" USING btree ("type");
  CREATE INDEX "activity_events_updated_at_idx" ON "activity_events" USING btree ("updated_at");
  CREATE INDEX "activity_events_created_at_idx" ON "activity_events" USING btree ("created_at");
  CREATE INDEX "notifications_activity_event_idx" ON "notifications" USING btree ("activity_event_id");
  CREATE INDEX "notifications_recipient_member_idx" ON "notifications" USING btree ("recipient_member_id");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE UNIQUE INDEX "activityEvent_recipientMember_idx" ON "notifications" USING btree ("activity_event_id","recipient_member_id");
  CREATE INDEX "notification_preferences_member_idx" ON "notification_preferences" USING btree ("member_id");
  CREATE INDEX "notification_preferences_updated_at_idx" ON "notification_preferences" USING btree ("updated_at");
  CREATE INDEX "notification_preferences_created_at_idx" ON "notification_preferences" USING btree ("created_at");
  CREATE INDEX "notification_channels_member_idx" ON "notification_channels" USING btree ("member_id");
  CREATE INDEX "notification_channels_updated_at_idx" ON "notification_channels" USING btree ("updated_at");
  CREATE INDEX "notification_channels_created_at_idx" ON "notification_channels" USING btree ("created_at");
  CREATE INDEX "digest_definitions_site_idx" ON "digest_definitions" USING btree ("site_id");
  CREATE INDEX "digest_definitions_publication_idx" ON "digest_definitions" USING btree ("publication_id");
  CREATE INDEX "digest_definitions_space_idx" ON "digest_definitions" USING btree ("space_id");
  CREATE INDEX "digest_definitions_owner_idx" ON "digest_definitions" USING btree ("owner_id");
  CREATE INDEX "digest_definitions_member_idx" ON "digest_definitions" USING btree ("member_id");
  CREATE INDEX "digest_definitions_updated_at_idx" ON "digest_definitions" USING btree ("updated_at");
  CREATE INDEX "digest_definitions_created_at_idx" ON "digest_definitions" USING btree ("created_at");
  CREATE INDEX "digest_runs_definition_idx" ON "digest_runs" USING btree ("definition_id");
  CREATE INDEX "digest_runs_updated_at_idx" ON "digest_runs" USING btree ("updated_at");
  CREATE INDEX "digest_runs_created_at_idx" ON "digest_runs" USING btree ("created_at");
  CREATE INDEX "delivery_receipts_delivery_idx" ON "delivery_receipts" USING btree ("delivery_id");
  CREATE INDEX "delivery_receipts_notification_idx" ON "delivery_receipts" USING btree ("notification_id");
  CREATE INDEX "delivery_receipts_updated_at_idx" ON "delivery_receipts" USING btree ("updated_at");
  CREATE INDEX "delivery_receipts_created_at_idx" ON "delivery_receipts" USING btree ("created_at");
  CREATE INDEX "automation_definitions_site_idx" ON "automation_definitions" USING btree ("site_id");
  CREATE INDEX "automation_definitions_publication_idx" ON "automation_definitions" USING btree ("publication_id");
  CREATE INDEX "automation_definitions_space_idx" ON "automation_definitions" USING btree ("space_id");
  CREATE INDEX "automation_definitions_owner_idx" ON "automation_definitions" USING btree ("owner_id");
  CREATE INDEX "automation_definitions_updated_at_idx" ON "automation_definitions" USING btree ("updated_at");
  CREATE INDEX "automation_definitions_created_at_idx" ON "automation_definitions" USING btree ("created_at");
  CREATE INDEX "analytics_events_site_idx" ON "analytics_events" USING btree ("site_id");
  CREATE INDEX "analytics_events_publication_idx" ON "analytics_events" USING btree ("publication_id");
  CREATE INDEX "analytics_events_space_idx" ON "analytics_events" USING btree ("space_id");
  CREATE INDEX "analytics_events_owner_idx" ON "analytics_events" USING btree ("owner_id");
  CREATE UNIQUE INDEX "analytics_events_event_id_idx" ON "analytics_events" USING btree ("event_id");
  CREATE UNIQUE INDEX "analytics_events_dedupe_key_idx" ON "analytics_events" USING btree ("dedupe_key");
  CREATE INDEX "analytics_events_event_type_idx" ON "analytics_events" USING btree ("event_type");
  CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events" USING btree ("occurred_at");
  CREATE INDEX "analytics_events_anonymous_hash_idx" ON "analytics_events" USING btree ("anonymous_hash");
  CREATE INDEX "analytics_events_session_hash_idx" ON "analytics_events" USING btree ("session_hash");
  CREATE INDEX "analytics_events_member_idx" ON "analytics_events" USING btree ("member_id");
  CREATE INDEX "analytics_events_updated_at_idx" ON "analytics_events" USING btree ("updated_at");
  CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");
  CREATE INDEX "site_occurredAt_idx" ON "analytics_events" USING btree ("site_id","occurred_at");
  CREATE INDEX "site_eventType_occurredAt_idx" ON "analytics_events" USING btree ("site_id","event_type","occurred_at");
  CREATE INDEX "analytics_rollups_site_idx" ON "analytics_rollups" USING btree ("site_id");
  CREATE INDEX "analytics_rollups_publication_idx" ON "analytics_rollups" USING btree ("publication_id");
  CREATE INDEX "analytics_rollups_space_idx" ON "analytics_rollups" USING btree ("space_id");
  CREATE INDEX "analytics_rollups_owner_idx" ON "analytics_rollups" USING btree ("owner_id");
  CREATE INDEX "analytics_rollups_metric_idx" ON "analytics_rollups" USING btree ("metric");
  CREATE INDEX "analytics_rollups_window_start_idx" ON "analytics_rollups" USING btree ("window_start");
  CREATE INDEX "analytics_rollups_updated_at_idx" ON "analytics_rollups" USING btree ("updated_at");
  CREATE INDEX "analytics_rollups_created_at_idx" ON "analytics_rollups" USING btree ("created_at");
  CREATE INDEX "site_metric_windowStart_idx" ON "analytics_rollups" USING btree ("site_id","metric","window_start");
  CREATE INDEX "metric_snapshots_site_idx" ON "metric_snapshots" USING btree ("site_id");
  CREATE INDEX "metric_snapshots_publication_idx" ON "metric_snapshots" USING btree ("publication_id");
  CREATE INDEX "metric_snapshots_space_idx" ON "metric_snapshots" USING btree ("space_id");
  CREATE INDEX "metric_snapshots_owner_idx" ON "metric_snapshots" USING btree ("owner_id");
  CREATE INDEX "metric_snapshots_metric_idx" ON "metric_snapshots" USING btree ("metric");
  CREATE UNIQUE INDEX "metric_snapshots_source_reference_idx" ON "metric_snapshots" USING btree ("source_reference");
  CREATE INDEX "metric_snapshots_updated_at_idx" ON "metric_snapshots" USING btree ("updated_at");
  CREATE INDEX "metric_snapshots_created_at_idx" ON "metric_snapshots" USING btree ("created_at");
  CREATE INDEX "analytics_goals_site_idx" ON "analytics_goals" USING btree ("site_id");
  CREATE INDEX "analytics_goals_publication_idx" ON "analytics_goals" USING btree ("publication_id");
  CREATE INDEX "analytics_goals_space_idx" ON "analytics_goals" USING btree ("space_id");
  CREATE INDEX "analytics_goals_owner_idx" ON "analytics_goals" USING btree ("owner_id");
  CREATE INDEX "analytics_goals_updated_at_idx" ON "analytics_goals" USING btree ("updated_at");
  CREATE INDEX "analytics_goals_created_at_idx" ON "analytics_goals" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_key_idx" ON "analytics_goals" USING btree ("site_id","key");
  CREATE UNIQUE INDEX "command_center_preferences_user_idx" ON "command_center_preferences" USING btree ("user_id");
  CREATE INDEX "command_center_preferences_updated_at_idx" ON "command_center_preferences" USING btree ("updated_at");
  CREATE INDEX "command_center_preferences_created_at_idx" ON "command_center_preferences" USING btree ("created_at");
  CREATE INDEX "experience_rules_site_idx" ON "experience_rules" USING btree ("site_id");
  CREATE INDEX "experience_rules_publication_idx" ON "experience_rules" USING btree ("publication_id");
  CREATE INDEX "experience_rules_space_idx" ON "experience_rules" USING btree ("space_id");
  CREATE INDEX "experience_rules_owner_idx" ON "experience_rules" USING btree ("owner_id");
  CREATE INDEX "experience_rules_approved_by_idx" ON "experience_rules" USING btree ("approved_by_id");
  CREATE INDEX "experience_rules_updated_at_idx" ON "experience_rules" USING btree ("updated_at");
  CREATE INDEX "experience_rules_created_at_idx" ON "experience_rules" USING btree ("created_at");
  CREATE INDEX "experience_variants_site_idx" ON "experience_variants" USING btree ("site_id");
  CREATE INDEX "experience_variants_publication_idx" ON "experience_variants" USING btree ("publication_id");
  CREATE INDEX "experience_variants_space_idx" ON "experience_variants" USING btree ("space_id");
  CREATE INDEX "experience_variants_owner_idx" ON "experience_variants" USING btree ("owner_id");
  CREATE INDEX "experience_variants_rule_idx" ON "experience_variants" USING btree ("rule_id");
  CREATE INDEX "experience_variants_content_revision_idx" ON "experience_variants" USING btree ("content_revision_id");
  CREATE INDEX "experience_variants_updated_at_idx" ON "experience_variants" USING btree ("updated_at");
  CREATE INDEX "experience_variants_created_at_idx" ON "experience_variants" USING btree ("created_at");
  CREATE INDEX "experiments_site_idx" ON "experiments" USING btree ("site_id");
  CREATE INDEX "experiments_publication_idx" ON "experiments" USING btree ("publication_id");
  CREATE INDEX "experiments_space_idx" ON "experiments" USING btree ("space_id");
  CREATE INDEX "experiments_owner_idx" ON "experiments" USING btree ("owner_id");
  CREATE INDEX "experiments_rule_idx" ON "experiments" USING btree ("rule_id");
  CREATE INDEX "experiments_conversion_goal_idx" ON "experiments" USING btree ("conversion_goal_id");
  CREATE INDEX "experiments_approved_by_idx" ON "experiments" USING btree ("approved_by_id");
  CREATE INDEX "experiments_updated_at_idx" ON "experiments" USING btree ("updated_at");
  CREATE INDEX "experiments_created_at_idx" ON "experiments" USING btree ("created_at");
  CREATE INDEX "experiment_variants_site_idx" ON "experiment_variants" USING btree ("site_id");
  CREATE INDEX "experiment_variants_publication_idx" ON "experiment_variants" USING btree ("publication_id");
  CREATE INDEX "experiment_variants_space_idx" ON "experiment_variants" USING btree ("space_id");
  CREATE INDEX "experiment_variants_owner_idx" ON "experiment_variants" USING btree ("owner_id");
  CREATE INDEX "experiment_variants_experiment_idx" ON "experiment_variants" USING btree ("experiment_id");
  CREATE INDEX "experiment_variants_experience_variant_idx" ON "experiment_variants" USING btree ("experience_variant_id");
  CREATE INDEX "experiment_variants_updated_at_idx" ON "experiment_variants" USING btree ("updated_at");
  CREATE INDEX "experiment_variants_created_at_idx" ON "experiment_variants" USING btree ("created_at");
  CREATE UNIQUE INDEX "experiment_name_idx" ON "experiment_variants" USING btree ("experiment_id","name");
  CREATE INDEX "traffic_allocations_site_idx" ON "traffic_allocations" USING btree ("site_id");
  CREATE INDEX "traffic_allocations_publication_idx" ON "traffic_allocations" USING btree ("publication_id");
  CREATE INDEX "traffic_allocations_space_idx" ON "traffic_allocations" USING btree ("space_id");
  CREATE INDEX "traffic_allocations_owner_idx" ON "traffic_allocations" USING btree ("owner_id");
  CREATE INDEX "traffic_allocations_experiment_idx" ON "traffic_allocations" USING btree ("experiment_id");
  CREATE INDEX "traffic_allocations_variant_idx" ON "traffic_allocations" USING btree ("variant_id");
  CREATE INDEX "traffic_allocations_updated_at_idx" ON "traffic_allocations" USING btree ("updated_at");
  CREATE INDEX "traffic_allocations_created_at_idx" ON "traffic_allocations" USING btree ("created_at");
  CREATE INDEX "experiment_assignments_site_idx" ON "experiment_assignments" USING btree ("site_id");
  CREATE INDEX "experiment_assignments_publication_idx" ON "experiment_assignments" USING btree ("publication_id");
  CREATE INDEX "experiment_assignments_space_idx" ON "experiment_assignments" USING btree ("space_id");
  CREATE INDEX "experiment_assignments_owner_idx" ON "experiment_assignments" USING btree ("owner_id");
  CREATE INDEX "experiment_assignments_experiment_idx" ON "experiment_assignments" USING btree ("experiment_id");
  CREATE INDEX "experiment_assignments_variant_idx" ON "experiment_assignments" USING btree ("variant_id");
  CREATE UNIQUE INDEX "experiment_assignments_dedupe_key_idx" ON "experiment_assignments" USING btree ("dedupe_key");
  CREATE INDEX "experiment_assignments_updated_at_idx" ON "experiment_assignments" USING btree ("updated_at");
  CREATE INDEX "experiment_assignments_created_at_idx" ON "experiment_assignments" USING btree ("created_at");
  CREATE UNIQUE INDEX "experiment_subjectKey_idx" ON "experiment_assignments" USING btree ("experiment_id","subject_key");
  CREATE INDEX "conversion_goals_site_idx" ON "conversion_goals" USING btree ("site_id");
  CREATE INDEX "conversion_goals_publication_idx" ON "conversion_goals" USING btree ("publication_id");
  CREATE INDEX "conversion_goals_space_idx" ON "conversion_goals" USING btree ("space_id");
  CREATE INDEX "conversion_goals_owner_idx" ON "conversion_goals" USING btree ("owner_id");
  CREATE INDEX "conversion_goals_updated_at_idx" ON "conversion_goals" USING btree ("updated_at");
  CREATE INDEX "conversion_goals_created_at_idx" ON "conversion_goals" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_key_1_idx" ON "conversion_goals" USING btree ("site_id","key");
  CREATE INDEX "experiment_events_site_idx" ON "experiment_events" USING btree ("site_id");
  CREATE INDEX "experiment_events_publication_idx" ON "experiment_events" USING btree ("publication_id");
  CREATE INDEX "experiment_events_space_idx" ON "experiment_events" USING btree ("space_id");
  CREATE INDEX "experiment_events_owner_idx" ON "experiment_events" USING btree ("owner_id");
  CREATE INDEX "experiment_events_experiment_idx" ON "experiment_events" USING btree ("experiment_id");
  CREATE INDEX "experiment_events_variant_idx" ON "experiment_events" USING btree ("variant_id");
  CREATE INDEX "experiment_events_assignment_idx" ON "experiment_events" USING btree ("assignment_id");
  CREATE UNIQUE INDEX "experiment_events_dedupe_key_idx" ON "experiment_events" USING btree ("dedupe_key");
  CREATE INDEX "experiment_events_updated_at_idx" ON "experiment_events" USING btree ("updated_at");
  CREATE INDEX "experiment_events_created_at_idx" ON "experiment_events" USING btree ("created_at");
  CREATE INDEX "experiment_analyses_site_idx" ON "experiment_analyses" USING btree ("site_id");
  CREATE INDEX "experiment_analyses_publication_idx" ON "experiment_analyses" USING btree ("publication_id");
  CREATE INDEX "experiment_analyses_space_idx" ON "experiment_analyses" USING btree ("space_id");
  CREATE INDEX "experiment_analyses_owner_idx" ON "experiment_analyses" USING btree ("owner_id");
  CREATE INDEX "experiment_analyses_experiment_idx" ON "experiment_analyses" USING btree ("experiment_id");
  CREATE INDEX "experiment_analyses_updated_at_idx" ON "experiment_analyses" USING btree ("updated_at");
  CREATE INDEX "experiment_analyses_created_at_idx" ON "experiment_analyses" USING btree ("created_at");
  CREATE INDEX "experiment_decisions_site_idx" ON "experiment_decisions" USING btree ("site_id");
  CREATE INDEX "experiment_decisions_publication_idx" ON "experiment_decisions" USING btree ("publication_id");
  CREATE INDEX "experiment_decisions_space_idx" ON "experiment_decisions" USING btree ("space_id");
  CREATE INDEX "experiment_decisions_owner_idx" ON "experiment_decisions" USING btree ("owner_id");
  CREATE INDEX "experiment_decisions_experiment_idx" ON "experiment_decisions" USING btree ("experiment_id");
  CREATE INDEX "experiment_decisions_selected_variant_idx" ON "experiment_decisions" USING btree ("selected_variant_id");
  CREATE INDEX "experiment_decisions_actor_idx" ON "experiment_decisions" USING btree ("actor_id");
  CREATE INDEX "experiment_decisions_approved_by_idx" ON "experiment_decisions" USING btree ("approved_by_id");
  CREATE INDEX "experiment_decisions_updated_at_idx" ON "experiment_decisions" USING btree ("updated_at");
  CREATE INDEX "experiment_decisions_created_at_idx" ON "experiment_decisions" USING btree ("created_at");
  CREATE INDEX "quality_policies_site_idx" ON "quality_policies" USING btree ("site_id");
  CREATE INDEX "quality_policies_publication_idx" ON "quality_policies" USING btree ("publication_id");
  CREATE INDEX "quality_policies_space_idx" ON "quality_policies" USING btree ("space_id");
  CREATE INDEX "quality_policies_owner_idx" ON "quality_policies" USING btree ("owner_id");
  CREATE INDEX "quality_policies_updated_at_idx" ON "quality_policies" USING btree ("updated_at");
  CREATE INDEX "quality_policies_created_at_idx" ON "quality_policies" USING btree ("created_at");
  CREATE INDEX "quality_rules_site_idx" ON "quality_rules" USING btree ("site_id");
  CREATE INDEX "quality_rules_publication_idx" ON "quality_rules" USING btree ("publication_id");
  CREATE INDEX "quality_rules_space_idx" ON "quality_rules" USING btree ("space_id");
  CREATE INDEX "quality_rules_owner_idx" ON "quality_rules" USING btree ("owner_id");
  CREATE INDEX "quality_rules_policy_idx" ON "quality_rules" USING btree ("policy_id");
  CREATE INDEX "quality_rules_updated_at_idx" ON "quality_rules" USING btree ("updated_at");
  CREATE INDEX "quality_rules_created_at_idx" ON "quality_rules" USING btree ("created_at");
  CREATE INDEX "quality_scans_site_idx" ON "quality_scans" USING btree ("site_id");
  CREATE INDEX "quality_scans_publication_idx" ON "quality_scans" USING btree ("publication_id");
  CREATE INDEX "quality_scans_space_idx" ON "quality_scans" USING btree ("space_id");
  CREATE INDEX "quality_scans_owner_idx" ON "quality_scans" USING btree ("owner_id");
  CREATE INDEX "quality_scans_policy_idx" ON "quality_scans" USING btree ("policy_id");
  CREATE INDEX "quality_scans_updated_at_idx" ON "quality_scans" USING btree ("updated_at");
  CREATE INDEX "quality_scans_created_at_idx" ON "quality_scans" USING btree ("created_at");
  CREATE INDEX "quality_issues_site_idx" ON "quality_issues" USING btree ("site_id");
  CREATE INDEX "quality_issues_publication_idx" ON "quality_issues" USING btree ("publication_id");
  CREATE INDEX "quality_issues_space_idx" ON "quality_issues" USING btree ("space_id");
  CREATE INDEX "quality_issues_scan_idx" ON "quality_issues" USING btree ("scan_id");
  CREATE INDEX "quality_issues_rule_idx" ON "quality_issues" USING btree ("rule_id");
  CREATE UNIQUE INDEX "quality_issues_dedupe_key_idx" ON "quality_issues" USING btree ("dedupe_key");
  CREATE INDEX "quality_issues_owner_idx" ON "quality_issues" USING btree ("owner_id");
  CREATE INDEX "quality_issues_updated_at_idx" ON "quality_issues" USING btree ("updated_at");
  CREATE INDEX "quality_issues_created_at_idx" ON "quality_issues" USING btree ("created_at");
  CREATE INDEX "quality_exceptions_site_idx" ON "quality_exceptions" USING btree ("site_id");
  CREATE INDEX "quality_exceptions_publication_idx" ON "quality_exceptions" USING btree ("publication_id");
  CREATE INDEX "quality_exceptions_space_idx" ON "quality_exceptions" USING btree ("space_id");
  CREATE INDEX "quality_exceptions_owner_idx" ON "quality_exceptions" USING btree ("owner_id");
  CREATE INDEX "quality_exceptions_rule_idx" ON "quality_exceptions" USING btree ("rule_id");
  CREATE INDEX "quality_exceptions_actor_idx" ON "quality_exceptions" USING btree ("actor_id");
  CREATE INDEX "quality_exceptions_updated_at_idx" ON "quality_exceptions" USING btree ("updated_at");
  CREATE INDEX "quality_exceptions_created_at_idx" ON "quality_exceptions" USING btree ("created_at");
  CREATE INDEX "quality_waivers_site_idx" ON "quality_waivers" USING btree ("site_id");
  CREATE INDEX "quality_waivers_publication_idx" ON "quality_waivers" USING btree ("publication_id");
  CREATE INDEX "quality_waivers_space_idx" ON "quality_waivers" USING btree ("space_id");
  CREATE INDEX "quality_waivers_owner_idx" ON "quality_waivers" USING btree ("owner_id");
  CREATE INDEX "quality_waivers_issue_idx" ON "quality_waivers" USING btree ("issue_id");
  CREATE INDEX "quality_waivers_actor_idx" ON "quality_waivers" USING btree ("actor_id");
  CREATE INDEX "quality_waivers_authorized_by_idx" ON "quality_waivers" USING btree ("authorized_by_id");
  CREATE INDEX "quality_waivers_updated_at_idx" ON "quality_waivers" USING btree ("updated_at");
  CREATE INDEX "quality_waivers_created_at_idx" ON "quality_waivers" USING btree ("created_at");
  CREATE INDEX "quality_reports_site_idx" ON "quality_reports" USING btree ("site_id");
  CREATE INDEX "quality_reports_publication_idx" ON "quality_reports" USING btree ("publication_id");
  CREATE INDEX "quality_reports_space_idx" ON "quality_reports" USING btree ("space_id");
  CREATE INDEX "quality_reports_owner_idx" ON "quality_reports" USING btree ("owner_id");
  CREATE INDEX "quality_reports_scan_idx" ON "quality_reports" USING btree ("scan_id");
  CREATE INDEX "quality_reports_updated_at_idx" ON "quality_reports" USING btree ("updated_at");
  CREATE INDEX "quality_reports_created_at_idx" ON "quality_reports" USING btree ("created_at");
  CREATE INDEX "merchant_connections_site_idx" ON "merchant_connections" USING btree ("site_id");
  CREATE INDEX "merchant_connections_publication_idx" ON "merchant_connections" USING btree ("publication_id");
  CREATE INDEX "merchant_connections_space_idx" ON "merchant_connections" USING btree ("space_id");
  CREATE INDEX "merchant_connections_owner_idx" ON "merchant_connections" USING btree ("owner_id");
  CREATE INDEX "merchant_connections_updated_at_idx" ON "merchant_connections" USING btree ("updated_at");
  CREATE INDEX "merchant_connections_created_at_idx" ON "merchant_connections" USING btree ("created_at");
  CREATE INDEX "payment_method_capabilities_site_idx" ON "payment_method_capabilities" USING btree ("site_id");
  CREATE INDEX "payment_method_capabilities_publication_idx" ON "payment_method_capabilities" USING btree ("publication_id");
  CREATE INDEX "payment_method_capabilities_space_idx" ON "payment_method_capabilities" USING btree ("space_id");
  CREATE INDEX "payment_method_capabilities_owner_idx" ON "payment_method_capabilities" USING btree ("owner_id");
  CREATE INDEX "payment_method_capabilities_merchant_connection_idx" ON "payment_method_capabilities" USING btree ("merchant_connection_id");
  CREATE INDEX "payment_method_capabilities_updated_at_idx" ON "payment_method_capabilities" USING btree ("updated_at");
  CREATE INDEX "payment_method_capabilities_created_at_idx" ON "payment_method_capabilities" USING btree ("created_at");
  CREATE INDEX "products_variants_order_idx" ON "products_variants" USING btree ("_order");
  CREATE INDEX "products_variants_parent_id_idx" ON "products_variants" USING btree ("_parent_id");
  CREATE INDEX "products_prices_order_idx" ON "products_prices" USING btree ("_order");
  CREATE INDEX "products_prices_parent_id_idx" ON "products_prices" USING btree ("_parent_id");
  CREATE INDEX "products_site_idx" ON "products" USING btree ("site_id");
  CREATE INDEX "products_publication_idx" ON "products" USING btree ("publication_id");
  CREATE INDEX "products_space_idx" ON "products" USING btree ("space_id");
  CREATE INDEX "products_owner_idx" ON "products" USING btree ("owner_id");
  CREATE INDEX "products_merchant_connection_idx" ON "products" USING btree ("merchant_connection_id");
  CREATE UNIQUE INDEX "products_canonical_path_idx" ON "products" USING btree ("canonical_path");
  CREATE INDEX "products_categories_idx" ON "products" USING btree ("categories_id");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_slug_1_idx" ON "products" USING btree ("site_id","slug");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_albums_id_idx" ON "products_rels" USING btree ("albums_id");
  CREATE INDEX "products_rels_media_assets_id_idx" ON "products_rels" USING btree ("media_assets_id");
  CREATE INDEX "carts_site_idx" ON "carts" USING btree ("site_id");
  CREATE INDEX "carts_publication_idx" ON "carts" USING btree ("publication_id");
  CREATE INDEX "carts_space_idx" ON "carts" USING btree ("space_id");
  CREATE INDEX "carts_owner_idx" ON "carts" USING btree ("owner_id");
  CREATE INDEX "carts_merchant_connection_idx" ON "carts" USING btree ("merchant_connection_id");
  CREATE INDEX "carts_idempotency_key_idx" ON "carts" USING btree ("idempotency_key");
  CREATE INDEX "carts_updated_at_idx" ON "carts" USING btree ("updated_at");
  CREATE INDEX "carts_created_at_idx" ON "carts" USING btree ("created_at");
  CREATE INDEX "checkout_sessions_site_idx" ON "checkout_sessions" USING btree ("site_id");
  CREATE INDEX "checkout_sessions_publication_idx" ON "checkout_sessions" USING btree ("publication_id");
  CREATE INDEX "checkout_sessions_space_idx" ON "checkout_sessions" USING btree ("space_id");
  CREATE INDEX "checkout_sessions_owner_idx" ON "checkout_sessions" USING btree ("owner_id");
  CREATE INDEX "checkout_sessions_cart_idx" ON "checkout_sessions" USING btree ("cart_id");
  CREATE INDEX "checkout_sessions_merchant_connection_idx" ON "checkout_sessions" USING btree ("merchant_connection_id");
  CREATE INDEX "checkout_sessions_idempotency_key_idx" ON "checkout_sessions" USING btree ("idempotency_key");
  CREATE INDEX "checkout_sessions_updated_at_idx" ON "checkout_sessions" USING btree ("updated_at");
  CREATE INDEX "checkout_sessions_created_at_idx" ON "checkout_sessions" USING btree ("created_at");
  CREATE INDEX "payment_intents_site_idx" ON "payment_intents" USING btree ("site_id");
  CREATE INDEX "payment_intents_publication_idx" ON "payment_intents" USING btree ("publication_id");
  CREATE INDEX "payment_intents_space_idx" ON "payment_intents" USING btree ("space_id");
  CREATE INDEX "payment_intents_owner_idx" ON "payment_intents" USING btree ("owner_id");
  CREATE INDEX "payment_intents_checkout_session_idx" ON "payment_intents" USING btree ("checkout_session_id");
  CREATE INDEX "payment_intents_merchant_connection_idx" ON "payment_intents" USING btree ("merchant_connection_id");
  CREATE INDEX "payment_intents_provider_reference_idx" ON "payment_intents" USING btree ("provider_reference");
  CREATE INDEX "payment_intents_updated_at_idx" ON "payment_intents" USING btree ("updated_at");
  CREATE INDEX "payment_intents_created_at_idx" ON "payment_intents" USING btree ("created_at");
  CREATE INDEX "orders_site_idx" ON "orders" USING btree ("site_id");
  CREATE INDEX "orders_publication_idx" ON "orders" USING btree ("publication_id");
  CREATE INDEX "orders_space_idx" ON "orders" USING btree ("space_id");
  CREATE INDEX "orders_owner_idx" ON "orders" USING btree ("owner_id");
  CREATE INDEX "orders_checkout_session_idx" ON "orders" USING btree ("checkout_session_id");
  CREATE INDEX "orders_merchant_connection_idx" ON "orders" USING btree ("merchant_connection_id");
  CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "payment_webhook_events_merchant_connection_idx" ON "payment_webhook_events" USING btree ("merchant_connection_id");
  CREATE INDEX "payment_webhook_events_updated_at_idx" ON "payment_webhook_events" USING btree ("updated_at");
  CREATE INDEX "payment_webhook_events_created_at_idx" ON "payment_webhook_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "providerKey_providerEventId_idx" ON "payment_webhook_events" USING btree ("provider_key","provider_event_id");
  CREATE INDEX "supporters_site_idx" ON "supporters" USING btree ("site_id");
  CREATE INDEX "supporters_publication_idx" ON "supporters" USING btree ("publication_id");
  CREATE INDEX "supporters_space_idx" ON "supporters" USING btree ("space_id");
  CREATE INDEX "supporters_owner_idx" ON "supporters" USING btree ("owner_id");
  CREATE INDEX "supporters_member_idx" ON "supporters" USING btree ("member_id");
  CREATE INDEX "supporters_email_hash_idx" ON "supporters" USING btree ("email_hash");
  CREATE INDEX "supporters_updated_at_idx" ON "supporters" USING btree ("updated_at");
  CREATE INDEX "supporters_created_at_idx" ON "supporters" USING btree ("created_at");
  CREATE INDEX "entitlements_site_idx" ON "entitlements" USING btree ("site_id");
  CREATE INDEX "entitlements_publication_idx" ON "entitlements" USING btree ("publication_id");
  CREATE INDEX "entitlements_space_idx" ON "entitlements" USING btree ("space_id");
  CREATE INDEX "entitlements_owner_idx" ON "entitlements" USING btree ("owner_id");
  CREATE INDEX "entitlements_supporter_idx" ON "entitlements" USING btree ("supporter_id");
  CREATE INDEX "entitlements_campaign_idx" ON "entitlements" USING btree ("campaign_id");
  CREATE INDEX "entitlements_payment_intent_idx" ON "entitlements" USING btree ("payment_intent_id");
  CREATE INDEX "entitlements_updated_at_idx" ON "entitlements" USING btree ("updated_at");
  CREATE INDEX "entitlements_created_at_idx" ON "entitlements" USING btree ("created_at");
  ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_email_messages_fk" FOREIGN KEY ("email_messages_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graphic_documents" ADD CONSTRAINT "graphic_documents_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_calendar_entry_id_calendar_entries_id_fk" FOREIGN KEY ("calendar_entry_id") REFERENCES "public"."calendar_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_releases_fk" FOREIGN KEY ("content_releases_id") REFERENCES "public"."content_releases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_definitions_fk" FOREIGN KEY ("form_definitions_id") REFERENCES "public"."form_definitions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_schemas_fk" FOREIGN KEY ("form_schemas_id") REFERENCES "public"."form_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_submissions_fk" FOREIGN KEY ("form_submissions_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_submission_attachments_fk" FOREIGN KEY ("submission_attachments_id") REFERENCES "public"."submission_attachments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contacts_fk" FOREIGN KEY ("contacts_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizations_fk" FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_relationship_records_fk" FOREIGN KEY ("relationship_records_id") REFERENCES "public"."relationship_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_tags_fk" FOREIGN KEY ("contact_tags_id") REFERENCES "public"."contact_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_taggings_fk" FOREIGN KEY ("contact_taggings_id") REFERENCES "public"."contact_taggings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_interaction_records_fk" FOREIGN KEY ("interaction_records_id") REFERENCES "public"."interaction_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_relationship_notes_fk" FOREIGN KEY ("relationship_notes_id") REFERENCES "public"."relationship_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_deals_opportunities_fk" FOREIGN KEY ("deals_opportunities_id") REFERENCES "public"."deals_opportunities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_owner_assignments_fk" FOREIGN KEY ("owner_assignments_id") REFERENCES "public"."owner_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_next_actions_fk" FOREIGN KEY ("next_actions_id") REFERENCES "public"."next_actions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workflow_items_fk" FOREIGN KEY ("workflow_items_id") REFERENCES "public"."workflow_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audience_lists_fk" FOREIGN KEY ("audience_lists_id") REFERENCES "public"."audience_lists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audience_segments_fk" FOREIGN KEY ("audience_segments_id") REFERENCES "public"."audience_segments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audience_memberships_fk" FOREIGN KEY ("audience_memberships_id") REFERENCES "public"."audience_memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscriber_confirmation_tok_fk" FOREIGN KEY ("subscriber_confirmation_tokens_id") REFERENCES "public"."subscriber_confirmation_tokens"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscribers_fk" FOREIGN KEY ("subscribers_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_events_fk" FOREIGN KEY ("consent_events_id") REFERENCES "public"."consent_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_preferences_fk" FOREIGN KEY ("preferences_id") REFERENCES "public"."preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_suppressions_fk" FOREIGN KEY ("suppressions_id") REFERENCES "public"."suppressions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_messages_fk" FOREIGN KEY ("email_messages_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_delivery_identities_fk" FOREIGN KEY ("delivery_identities_id") REFERENCES "public"."delivery_identities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_deliveries_fk" FOREIGN KEY ("email_deliveries_id") REFERENCES "public"."email_deliveries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_activity_events_fk" FOREIGN KEY ("activity_events_id") REFERENCES "public"."activity_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_preferences_fk" FOREIGN KEY ("notification_preferences_id") REFERENCES "public"."notification_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_channels_fk" FOREIGN KEY ("notification_channels_id") REFERENCES "public"."notification_channels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_digest_definitions_fk" FOREIGN KEY ("digest_definitions_id") REFERENCES "public"."digest_definitions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_digest_runs_fk" FOREIGN KEY ("digest_runs_id") REFERENCES "public"."digest_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_delivery_receipts_fk" FOREIGN KEY ("delivery_receipts_id") REFERENCES "public"."delivery_receipts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_automation_definitions_fk" FOREIGN KEY ("automation_definitions_id") REFERENCES "public"."automation_definitions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_events_fk" FOREIGN KEY ("analytics_events_id") REFERENCES "public"."analytics_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_rollups_fk" FOREIGN KEY ("analytics_rollups_id") REFERENCES "public"."analytics_rollups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_metric_snapshots_fk" FOREIGN KEY ("metric_snapshots_id") REFERENCES "public"."metric_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_goals_fk" FOREIGN KEY ("analytics_goals_id") REFERENCES "public"."analytics_goals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_command_center_preferences_fk" FOREIGN KEY ("command_center_preferences_id") REFERENCES "public"."command_center_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experience_rules_fk" FOREIGN KEY ("experience_rules_id") REFERENCES "public"."experience_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experience_variants_fk" FOREIGN KEY ("experience_variants_id") REFERENCES "public"."experience_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiments_fk" FOREIGN KEY ("experiments_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_variants_fk" FOREIGN KEY ("experiment_variants_id") REFERENCES "public"."experiment_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_traffic_allocations_fk" FOREIGN KEY ("traffic_allocations_id") REFERENCES "public"."traffic_allocations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_assignments_fk" FOREIGN KEY ("experiment_assignments_id") REFERENCES "public"."experiment_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_conversion_goals_fk" FOREIGN KEY ("conversion_goals_id") REFERENCES "public"."conversion_goals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_events_fk" FOREIGN KEY ("experiment_events_id") REFERENCES "public"."experiment_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_analyses_fk" FOREIGN KEY ("experiment_analyses_id") REFERENCES "public"."experiment_analyses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiment_decisions_fk" FOREIGN KEY ("experiment_decisions_id") REFERENCES "public"."experiment_decisions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_policies_fk" FOREIGN KEY ("quality_policies_id") REFERENCES "public"."quality_policies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_rules_fk" FOREIGN KEY ("quality_rules_id") REFERENCES "public"."quality_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_scans_fk" FOREIGN KEY ("quality_scans_id") REFERENCES "public"."quality_scans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_issues_fk" FOREIGN KEY ("quality_issues_id") REFERENCES "public"."quality_issues"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_exceptions_fk" FOREIGN KEY ("quality_exceptions_id") REFERENCES "public"."quality_exceptions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_waivers_fk" FOREIGN KEY ("quality_waivers_id") REFERENCES "public"."quality_waivers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quality_reports_fk" FOREIGN KEY ("quality_reports_id") REFERENCES "public"."quality_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_merchant_connections_fk" FOREIGN KEY ("merchant_connections_id") REFERENCES "public"."merchant_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_method_capabilities_fk" FOREIGN KEY ("payment_method_capabilities_id") REFERENCES "public"."payment_method_capabilities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_carts_fk" FOREIGN KEY ("carts_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_checkout_sessions_fk" FOREIGN KEY ("checkout_sessions_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_intents_fk" FOREIGN KEY ("payment_intents_id") REFERENCES "public"."payment_intents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_webhook_events_fk" FOREIGN KEY ("payment_webhook_events_id") REFERENCES "public"."payment_webhook_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_supporters_fk" FOREIGN KEY ("supporters_id") REFERENCES "public"."supporters"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_entitlements_fk" FOREIGN KEY ("entitlements_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_usages_rels_email_messages_id_idx" ON "media_usages_rels" USING btree ("email_messages_id");
  CREATE INDEX "graphic_documents_site_idx" ON "graphic_documents" USING btree ("site_id");
  CREATE INDEX "graphic_documents_publication_idx" ON "graphic_documents" USING btree ("publication_id");
  CREATE INDEX "graphic_documents_space_idx" ON "graphic_documents" USING btree ("space_id");
  CREATE INDEX "graphic_documents_owner_idx" ON "graphic_documents" USING btree ("owner_id");
  CREATE INDEX "campaigns_calendar_entry_idx" ON "campaigns" USING btree ("calendar_entry_id");
  CREATE INDEX "payload_locked_documents_rels_content_releases_id_idx" ON "payload_locked_documents_rels" USING btree ("content_releases_id");
  CREATE INDEX "payload_locked_documents_rels_form_definitions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_definitions_id");
  CREATE INDEX "payload_locked_documents_rels_form_schemas_id_idx" ON "payload_locked_documents_rels" USING btree ("form_schemas_id");
  CREATE INDEX "payload_locked_documents_rels_form_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_submissions_id");
  CREATE INDEX "payload_locked_documents_rels_submission_attachments_id_idx" ON "payload_locked_documents_rels" USING btree ("submission_attachments_id");
  CREATE INDEX "payload_locked_documents_rels_contacts_id_idx" ON "payload_locked_documents_rels" USING btree ("contacts_id");
  CREATE INDEX "payload_locked_documents_rels_organizations_id_idx" ON "payload_locked_documents_rels" USING btree ("organizations_id");
  CREATE INDEX "payload_locked_documents_rels_relationship_records_id_idx" ON "payload_locked_documents_rels" USING btree ("relationship_records_id");
  CREATE INDEX "payload_locked_documents_rels_contact_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_tags_id");
  CREATE INDEX "payload_locked_documents_rels_contact_taggings_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_taggings_id");
  CREATE INDEX "payload_locked_documents_rels_interaction_records_id_idx" ON "payload_locked_documents_rels" USING btree ("interaction_records_id");
  CREATE INDEX "payload_locked_documents_rels_relationship_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("relationship_notes_id");
  CREATE INDEX "payload_locked_documents_rels_deals_opportunities_id_idx" ON "payload_locked_documents_rels" USING btree ("deals_opportunities_id");
  CREATE INDEX "payload_locked_documents_rels_owner_assignments_id_idx" ON "payload_locked_documents_rels" USING btree ("owner_assignments_id");
  CREATE INDEX "payload_locked_documents_rels_next_actions_id_idx" ON "payload_locked_documents_rels" USING btree ("next_actions_id");
  CREATE INDEX "payload_locked_documents_rels_workflow_items_id_idx" ON "payload_locked_documents_rels" USING btree ("workflow_items_id");
  CREATE INDEX "payload_locked_documents_rels_audience_lists_id_idx" ON "payload_locked_documents_rels" USING btree ("audience_lists_id");
  CREATE INDEX "payload_locked_documents_rels_audience_segments_id_idx" ON "payload_locked_documents_rels" USING btree ("audience_segments_id");
  CREATE INDEX "payload_locked_documents_rels_audience_memberships_id_idx" ON "payload_locked_documents_rels" USING btree ("audience_memberships_id");
  CREATE INDEX "payload_locked_documents_rels_subscriber_confirmation_to_idx" ON "payload_locked_documents_rels" USING btree ("subscriber_confirmation_tokens_id");
  CREATE INDEX "payload_locked_documents_rels_subscribers_id_idx" ON "payload_locked_documents_rels" USING btree ("subscribers_id");
  CREATE INDEX "payload_locked_documents_rels_consent_events_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_events_id");
  CREATE INDEX "payload_locked_documents_rels_preferences_id_idx" ON "payload_locked_documents_rels" USING btree ("preferences_id");
  CREATE INDEX "payload_locked_documents_rels_suppressions_id_idx" ON "payload_locked_documents_rels" USING btree ("suppressions_id");
  CREATE INDEX "payload_locked_documents_rels_email_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("email_messages_id");
  CREATE INDEX "payload_locked_documents_rels_delivery_identities_id_idx" ON "payload_locked_documents_rels" USING btree ("delivery_identities_id");
  CREATE INDEX "payload_locked_documents_rels_email_deliveries_id_idx" ON "payload_locked_documents_rels" USING btree ("email_deliveries_id");
  CREATE INDEX "payload_locked_documents_rels_activity_events_id_idx" ON "payload_locked_documents_rels" USING btree ("activity_events_id");
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX "payload_locked_documents_rels_notification_preferences_i_idx" ON "payload_locked_documents_rels" USING btree ("notification_preferences_id");
  CREATE INDEX "payload_locked_documents_rels_notification_channels_id_idx" ON "payload_locked_documents_rels" USING btree ("notification_channels_id");
  CREATE INDEX "payload_locked_documents_rels_digest_definitions_id_idx" ON "payload_locked_documents_rels" USING btree ("digest_definitions_id");
  CREATE INDEX "payload_locked_documents_rels_digest_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("digest_runs_id");
  CREATE INDEX "payload_locked_documents_rels_delivery_receipts_id_idx" ON "payload_locked_documents_rels" USING btree ("delivery_receipts_id");
  CREATE INDEX "payload_locked_documents_rels_automation_definitions_id_idx" ON "payload_locked_documents_rels" USING btree ("automation_definitions_id");
  CREATE INDEX "payload_locked_documents_rels_analytics_events_id_idx" ON "payload_locked_documents_rels" USING btree ("analytics_events_id");
  CREATE INDEX "payload_locked_documents_rels_analytics_rollups_id_idx" ON "payload_locked_documents_rels" USING btree ("analytics_rollups_id");
  CREATE INDEX "payload_locked_documents_rels_metric_snapshots_id_idx" ON "payload_locked_documents_rels" USING btree ("metric_snapshots_id");
  CREATE INDEX "payload_locked_documents_rels_analytics_goals_id_idx" ON "payload_locked_documents_rels" USING btree ("analytics_goals_id");
  CREATE INDEX "payload_locked_documents_rels_command_center_preferences_idx" ON "payload_locked_documents_rels" USING btree ("command_center_preferences_id");
  CREATE INDEX "payload_locked_documents_rels_experience_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("experience_rules_id");
  CREATE INDEX "payload_locked_documents_rels_experience_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("experience_variants_id");
  CREATE INDEX "payload_locked_documents_rels_experiments_id_idx" ON "payload_locked_documents_rels" USING btree ("experiments_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_variants_id");
  CREATE INDEX "payload_locked_documents_rels_traffic_allocations_id_idx" ON "payload_locked_documents_rels" USING btree ("traffic_allocations_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_assignments_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_assignments_id");
  CREATE INDEX "payload_locked_documents_rels_conversion_goals_id_idx" ON "payload_locked_documents_rels" USING btree ("conversion_goals_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_events_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_events_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_analyses_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_analyses_id");
  CREATE INDEX "payload_locked_documents_rels_experiment_decisions_id_idx" ON "payload_locked_documents_rels" USING btree ("experiment_decisions_id");
  CREATE INDEX "payload_locked_documents_rels_quality_policies_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_policies_id");
  CREATE INDEX "payload_locked_documents_rels_quality_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_rules_id");
  CREATE INDEX "payload_locked_documents_rels_quality_scans_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_scans_id");
  CREATE INDEX "payload_locked_documents_rels_quality_issues_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_issues_id");
  CREATE INDEX "payload_locked_documents_rels_quality_exceptions_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_exceptions_id");
  CREATE INDEX "payload_locked_documents_rels_quality_waivers_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_waivers_id");
  CREATE INDEX "payload_locked_documents_rels_quality_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("quality_reports_id");
  CREATE INDEX "payload_locked_documents_rels_merchant_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("merchant_connections_id");
  CREATE INDEX "payload_locked_documents_rels_payment_method_capabilitie_idx" ON "payload_locked_documents_rels" USING btree ("payment_method_capabilities_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_carts_id_idx" ON "payload_locked_documents_rels" USING btree ("carts_id");
  CREATE INDEX "payload_locked_documents_rels_checkout_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("checkout_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_payment_intents_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_intents_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_payment_webhook_events_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_webhook_events_id");
  CREATE INDEX "payload_locked_documents_rels_supporters_id_idx" ON "payload_locked_documents_rels" USING btree ("supporters_id");
  CREATE INDEX "payload_locked_documents_rels_entitlements_id_idx" ON "payload_locked_documents_rels" USING btree ("entitlements_id");`)},down:async function a({db:b,payload:c,req:d}){await b.execute(aa.sql`
   ALTER TABLE "content_releases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_definitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_schemas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_submissions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "submission_attachments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "contacts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organizations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "relationship_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "contact_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "contact_taggings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "interaction_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "relationship_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "deals_opportunities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "owner_assignments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "next_actions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "workflow_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "workflow_items_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audience_lists" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audience_segments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audience_memberships" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subscriber_confirmation_tokens" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subscribers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "consent_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "preferences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "suppressions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_identities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_deliveries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "activity_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_preferences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_channels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "digest_definitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "digest_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_receipts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "automation_definitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "analytics_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "analytics_rollups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "metric_snapshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "analytics_goals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "command_center_preferences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experience_rules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experience_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "traffic_allocations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_assignments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "conversion_goals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_analyses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "experiment_decisions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_policies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_rules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_scans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_issues" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_exceptions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_waivers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quality_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "merchant_connections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_method_capabilities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_prices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "carts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "checkout_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_intents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payment_webhook_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "supporters" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "entitlements" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "content_releases" CASCADE;
  DROP TABLE "form_definitions" CASCADE;
  DROP TABLE "form_schemas" CASCADE;
  DROP TABLE "form_submissions" CASCADE;
  DROP TABLE "submission_attachments" CASCADE;
  DROP TABLE "contacts" CASCADE;
  DROP TABLE "organizations" CASCADE;
  DROP TABLE "relationship_records" CASCADE;
  DROP TABLE "contact_tags" CASCADE;
  DROP TABLE "contact_taggings" CASCADE;
  DROP TABLE "interaction_records" CASCADE;
  DROP TABLE "relationship_notes" CASCADE;
  DROP TABLE "deals_opportunities" CASCADE;
  DROP TABLE "owner_assignments" CASCADE;
  DROP TABLE "next_actions" CASCADE;
  DROP TABLE "workflow_items" CASCADE;
  DROP TABLE "workflow_items_rels" CASCADE;
  DROP TABLE "audience_lists" CASCADE;
  DROP TABLE "audience_segments" CASCADE;
  DROP TABLE "audience_memberships" CASCADE;
  DROP TABLE "subscriber_confirmation_tokens" CASCADE;
  DROP TABLE "subscribers" CASCADE;
  DROP TABLE "consent_events" CASCADE;
  DROP TABLE "preferences" CASCADE;
  DROP TABLE "suppressions" CASCADE;
  DROP TABLE "email_messages" CASCADE;
  DROP TABLE "delivery_identities" CASCADE;
  DROP TABLE "email_deliveries" CASCADE;
  DROP TABLE "activity_events" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "notification_preferences" CASCADE;
  DROP TABLE "notification_channels" CASCADE;
  DROP TABLE "digest_definitions" CASCADE;
  DROP TABLE "digest_runs" CASCADE;
  DROP TABLE "delivery_receipts" CASCADE;
  DROP TABLE "automation_definitions" CASCADE;
  DROP TABLE "analytics_events" CASCADE;
  DROP TABLE "analytics_rollups" CASCADE;
  DROP TABLE "metric_snapshots" CASCADE;
  DROP TABLE "analytics_goals" CASCADE;
  DROP TABLE "command_center_preferences" CASCADE;
  DROP TABLE "experience_rules" CASCADE;
  DROP TABLE "experience_variants" CASCADE;
  DROP TABLE "experiments" CASCADE;
  DROP TABLE "experiment_variants" CASCADE;
  DROP TABLE "traffic_allocations" CASCADE;
  DROP TABLE "experiment_assignments" CASCADE;
  DROP TABLE "conversion_goals" CASCADE;
  DROP TABLE "experiment_events" CASCADE;
  DROP TABLE "experiment_analyses" CASCADE;
  DROP TABLE "experiment_decisions" CASCADE;
  DROP TABLE "quality_policies" CASCADE;
  DROP TABLE "quality_rules" CASCADE;
  DROP TABLE "quality_scans" CASCADE;
  DROP TABLE "quality_issues" CASCADE;
  DROP TABLE "quality_exceptions" CASCADE;
  DROP TABLE "quality_waivers" CASCADE;
  DROP TABLE "quality_reports" CASCADE;
  DROP TABLE "merchant_connections" CASCADE;
  DROP TABLE "payment_method_capabilities" CASCADE;
  DROP TABLE "products_variants" CASCADE;
  DROP TABLE "products_prices" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "carts" CASCADE;
  DROP TABLE "checkout_sessions" CASCADE;
  DROP TABLE "payment_intents" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "payment_webhook_events" CASCADE;
  DROP TABLE "supporters" CASCADE;
  DROP TABLE "entitlements" CASCADE;
  ALTER TABLE "media_usages_rels" DROP CONSTRAINT "media_usages_rels_email_messages_fk";
  
  ALTER TABLE "graphic_documents" DROP CONSTRAINT "graphic_documents_site_id_sites_id_fk";
  
  ALTER TABLE "graphic_documents" DROP CONSTRAINT "graphic_documents_publication_id_publications_id_fk";
  
  ALTER TABLE "graphic_documents" DROP CONSTRAINT "graphic_documents_space_id_spaces_id_fk";
  
  ALTER TABLE "graphic_documents" DROP CONSTRAINT "graphic_documents_owner_id_members_id_fk";
  
  ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_calendar_entry_id_calendar_entries_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_content_releases_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_definitions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_schemas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_submissions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_submission_attachments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_contacts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organizations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_relationship_records_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_contact_tags_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_contact_taggings_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_interaction_records_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_relationship_notes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_deals_opportunities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_owner_assignments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_next_actions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_workflow_items_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audience_lists_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audience_segments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audience_memberships_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subscriber_confirmation_tok_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subscribers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_consent_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_preferences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_suppressions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_messages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_delivery_identities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_deliveries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_activity_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notifications_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notification_preferences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notification_channels_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_digest_definitions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_digest_runs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_delivery_receipts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_automation_definitions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_analytics_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_analytics_rollups_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_metric_snapshots_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_analytics_goals_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_command_center_preferences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experience_rules_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experience_variants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_variants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_traffic_allocations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_assignments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_conversion_goals_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_analyses_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiment_decisions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_policies_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_rules_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_scans_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_issues_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_exceptions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_waivers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quality_reports_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_merchant_connections_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_method_capabilities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_products_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_carts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_checkout_sessions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_intents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_orders_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_webhook_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_supporters_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_entitlements_fk";
  
  ALTER TABLE "media_usages" ALTER COLUMN "purpose" SET DATA TYPE text;
  DROP TYPE "public"."enum_media_usages_purpose";
  DO $$ BEGIN
    CREATE TYPE "public"."enum_media_usages_purpose" AS ENUM('hero', 'inline', 'cover', 'attachment', 'avatar', 'thumbnail');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TABLE "media_usages" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_media_usages_purpose" USING "purpose"::"public"."enum_media_usages_purpose";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish', 'media-import', 'media-render', 'media-transcribe', 'media-tts', 'social-publish');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DO $$ BEGIN
    CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'operations-heartbeat', 'operations-forced-failure', 'editorial-publish', 'media-import', 'media-render', 'media-transcribe', 'media-tts', 'social-publish');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "media_usages_rels_email_messages_id_idx";
  DROP INDEX "graphic_documents_site_idx";
  DROP INDEX "graphic_documents_publication_idx";
  DROP INDEX "graphic_documents_space_idx";
  DROP INDEX "graphic_documents_owner_idx";
  DROP INDEX "campaigns_calendar_entry_idx";
  DROP INDEX "payload_locked_documents_rels_content_releases_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_definitions_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_schemas_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_submissions_id_idx";
  DROP INDEX "payload_locked_documents_rels_submission_attachments_id_idx";
  DROP INDEX "payload_locked_documents_rels_contacts_id_idx";
  DROP INDEX "payload_locked_documents_rels_organizations_id_idx";
  DROP INDEX "payload_locked_documents_rels_relationship_records_id_idx";
  DROP INDEX "payload_locked_documents_rels_contact_tags_id_idx";
  DROP INDEX "payload_locked_documents_rels_contact_taggings_id_idx";
  DROP INDEX "payload_locked_documents_rels_interaction_records_id_idx";
  DROP INDEX "payload_locked_documents_rels_relationship_notes_id_idx";
  DROP INDEX "payload_locked_documents_rels_deals_opportunities_id_idx";
  DROP INDEX "payload_locked_documents_rels_owner_assignments_id_idx";
  DROP INDEX "payload_locked_documents_rels_next_actions_id_idx";
  DROP INDEX "payload_locked_documents_rels_workflow_items_id_idx";
  DROP INDEX "payload_locked_documents_rels_audience_lists_id_idx";
  DROP INDEX "payload_locked_documents_rels_audience_segments_id_idx";
  DROP INDEX "payload_locked_documents_rels_audience_memberships_id_idx";
  DROP INDEX "payload_locked_documents_rels_subscriber_confirmation_to_idx";
  DROP INDEX "payload_locked_documents_rels_subscribers_id_idx";
  DROP INDEX "payload_locked_documents_rels_consent_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_preferences_id_idx";
  DROP INDEX "payload_locked_documents_rels_suppressions_id_idx";
  DROP INDEX "payload_locked_documents_rels_email_messages_id_idx";
  DROP INDEX "payload_locked_documents_rels_delivery_identities_id_idx";
  DROP INDEX "payload_locked_documents_rels_email_deliveries_id_idx";
  DROP INDEX "payload_locked_documents_rels_activity_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_notifications_id_idx";
  DROP INDEX "payload_locked_documents_rels_notification_preferences_i_idx";
  DROP INDEX "payload_locked_documents_rels_notification_channels_id_idx";
  DROP INDEX "payload_locked_documents_rels_digest_definitions_id_idx";
  DROP INDEX "payload_locked_documents_rels_digest_runs_id_idx";
  DROP INDEX "payload_locked_documents_rels_delivery_receipts_id_idx";
  DROP INDEX "payload_locked_documents_rels_automation_definitions_id_idx";
  DROP INDEX "payload_locked_documents_rels_analytics_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_analytics_rollups_id_idx";
  DROP INDEX "payload_locked_documents_rels_metric_snapshots_id_idx";
  DROP INDEX "payload_locked_documents_rels_analytics_goals_id_idx";
  DROP INDEX "payload_locked_documents_rels_command_center_preferences_idx";
  DROP INDEX "payload_locked_documents_rels_experience_rules_id_idx";
  DROP INDEX "payload_locked_documents_rels_experience_variants_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiments_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_variants_id_idx";
  DROP INDEX "payload_locked_documents_rels_traffic_allocations_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_assignments_id_idx";
  DROP INDEX "payload_locked_documents_rels_conversion_goals_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_analyses_id_idx";
  DROP INDEX "payload_locked_documents_rels_experiment_decisions_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_policies_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_rules_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_scans_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_issues_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_exceptions_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_waivers_id_idx";
  DROP INDEX "payload_locked_documents_rels_quality_reports_id_idx";
  DROP INDEX "payload_locked_documents_rels_merchant_connections_id_idx";
  DROP INDEX "payload_locked_documents_rels_payment_method_capabilitie_idx";
  DROP INDEX "payload_locked_documents_rels_products_id_idx";
  DROP INDEX "payload_locked_documents_rels_carts_id_idx";
  DROP INDEX "payload_locked_documents_rels_checkout_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_payment_intents_id_idx";
  DROP INDEX "payload_locked_documents_rels_orders_id_idx";
  DROP INDEX "payload_locked_documents_rels_payment_webhook_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_supporters_id_idx";
  DROP INDEX "payload_locked_documents_rels_entitlements_id_idx";
  ALTER TABLE "media_assets" DROP COLUMN "rights_status";
  ALTER TABLE "media_usages_rels" DROP COLUMN "email_messages_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "site_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "publication_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "space_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "owner_id";
  ALTER TABLE "graphic_documents" DROP COLUMN "template";
  ALTER TABLE "graphic_documents" DROP COLUMN "layout_variant";
  ALTER TABLE "campaigns" DROP COLUMN "visibility";
  ALTER TABLE "campaigns" DROP COLUMN "start_at";
  ALTER TABLE "campaigns" DROP COLUMN "end_at";
  ALTER TABLE "campaigns" DROP COLUMN "goal";
  ALTER TABLE "campaigns" DROP COLUMN "milestones";
  ALTER TABLE "campaigns" DROP COLUMN "updates";
  ALTER TABLE "campaigns" DROP COLUMN "tiers";
  ALTER TABLE "campaigns" DROP COLUMN "progress";
  ALTER TABLE "campaigns" DROP COLUMN "calendar_entry_id";
  ALTER TABLE "campaigns" DROP COLUMN "supporter_visibility";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "content_releases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_definitions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_schemas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_submissions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "submission_attachments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "contacts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organizations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "relationship_records_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "contact_tags_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "contact_taggings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "interaction_records_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "relationship_notes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "deals_opportunities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "owner_assignments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "next_actions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "workflow_items_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audience_lists_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audience_segments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audience_memberships_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscriber_confirmation_tokens_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscribers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consent_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "preferences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "suppressions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_messages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "delivery_identities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_deliveries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "activity_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notifications_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notification_preferences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notification_channels_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "digest_definitions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "digest_runs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "delivery_receipts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "automation_definitions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "analytics_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "analytics_rollups_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "metric_snapshots_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "analytics_goals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "command_center_preferences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experience_rules_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experience_variants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_variants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "traffic_allocations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_assignments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "conversion_goals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_analyses_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiment_decisions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_policies_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_rules_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_scans_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_issues_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_exceptions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_waivers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quality_reports_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "merchant_connections_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_method_capabilities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "products_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "carts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "checkout_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_intents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "orders_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_webhook_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "supporters_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "entitlements_id";
  DROP TYPE "public"."enum_media_assets_rights_status";
  DROP TYPE "public"."enum_content_releases_status";
  DROP TYPE "public"."enum_campaigns_visibility";
  DROP TYPE "public"."enum_campaigns_supporter_visibility";
  DROP TYPE "public"."enum_form_definitions_template";
  DROP TYPE "public"."enum_form_definitions_visibility";
  DROP TYPE "public"."enum_form_definitions_retention_mode";
  DROP TYPE "public"."enum_form_definitions_retention_hold";
  DROP TYPE "public"."enum_form_schemas_state";
  DROP TYPE "public"."enum_form_schemas_consent_translation_status";
  DROP TYPE "public"."enum_form_submissions_status";
  DROP TYPE "public"."enum_form_submissions_privacy_class";
  DROP TYPE "public"."enum_form_submissions_retention_mode";
  DROP TYPE "public"."enum_form_submissions_retention_hold";
  DROP TYPE "public"."enum_submission_attachments_scan_status";
  DROP TYPE "public"."enum_contacts_status";
  DROP TYPE "public"."enum_contacts_merge_state";
  DROP TYPE "public"."enum_contacts_retention_mode";
  DROP TYPE "public"."enum_contacts_retention_hold";
  DROP TYPE "public"."enum_organizations_status";
  DROP TYPE "public"."enum_organizations_retention_mode";
  DROP TYPE "public"."enum_organizations_retention_hold";
  DROP TYPE "public"."enum_interaction_records_kind";
  DROP TYPE "public"."enum_deals_opportunities_stage";
  DROP TYPE "public"."enum_next_actions_status";
  DROP TYPE "public"."enum_workflow_items_type";
  DROP TYPE "public"."enum_workflow_items_status";
  DROP TYPE "public"."enum_workflow_items_priority";
  DROP TYPE "public"."enum_audience_lists_status";
  DROP TYPE "public"."enum_audience_segments_status";
  DROP TYPE "public"."enum_audience_memberships_status";
  DROP TYPE "public"."enum_subscribers_status";
  DROP TYPE "public"."enum_consent_events_event";
  DROP TYPE "public"."enum_suppressions_reason";
  DROP TYPE "public"."enum_email_messages_kind";
  DROP TYPE "public"."enum_email_messages_status";
  DROP TYPE "public"."enum_email_deliveries_status";
  DROP TYPE "public"."enum_notifications_status";
  DROP TYPE "public"."enum_notification_channels_kind";
  DROP TYPE "public"."enum_digest_definitions_cadence";
  DROP TYPE "public"."enum_digest_runs_status";
  DROP TYPE "public"."enum_delivery_receipts_channel";
  DROP TYPE "public"."enum_delivery_receipts_status";
  DROP TYPE "public"."enum_automation_definitions_status";
  DROP TYPE "public"."enum_analytics_events_consent_basis";
  DROP TYPE "public"."enum_analytics_events_retention_mode";
  DROP TYPE "public"."enum_analytics_events_retention_hold";
  DROP TYPE "public"."enum_analytics_rollups_grain";
  DROP TYPE "public"."enum_analytics_rollups_retention_mode";
  DROP TYPE "public"."enum_analytics_rollups_retention_hold";
  DROP TYPE "public"."enum_metric_snapshots_grain";
  DROP TYPE "public"."enum_metric_snapshots_reconciliation_status";
  DROP TYPE "public"."enum_metric_snapshots_retention_mode";
  DROP TYPE "public"."enum_metric_snapshots_retention_hold";
  DROP TYPE "public"."enum_experience_rules_status";
  DROP TYPE "public"."enum_experience_variants_status";
  DROP TYPE "public"."enum_experiments_state";
  DROP TYPE "public"."enum_experiment_events_kind";
  DROP TYPE "public"."enum_experiment_decisions_decision";
  DROP TYPE "public"."enum_quality_policies_status";
  DROP TYPE "public"."enum_quality_rules_severity";
  DROP TYPE "public"."enum_quality_scans_target_type";
  DROP TYPE "public"."enum_quality_scans_status";
  DROP TYPE "public"."enum_quality_issues_severity";
  DROP TYPE "public"."enum_quality_issues_status";
  DROP TYPE "public"."enum_merchant_connections_status";
  DROP TYPE "public"."enum_payment_method_capabilities_family";
  DROP TYPE "public"."enum_payment_method_capabilities_flow";
  DROP TYPE "public"."enum_payment_method_capabilities_health";
  DROP TYPE "public"."enum_products_variants_inventory_policy";
  DROP TYPE "public"."enum_products_prices_recurring_interval";
  DROP TYPE "public"."enum_products_kind";
  DROP TYPE "public"."enum_products_state";
  DROP TYPE "public"."enum_products_retention_mode";
  DROP TYPE "public"."enum_products_retention_hold";
  DROP TYPE "public"."enum_carts_state";
  DROP TYPE "public"."enum_checkout_sessions_state";
  DROP TYPE "public"."enum_payment_intents_state";
  DROP TYPE "public"."enum_orders_state";
  DROP TYPE "public"."enum_supporters_visibility_preference";`)},name:"20260826_053416_second_pass_schema"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_content_releases_status" ADD VALUE IF NOT EXISTS 'executing';
    ALTER TYPE "public"."enum_content_releases_status" ADD VALUE IF NOT EXISTS 'partial-failure';
    ALTER TYPE "public"."enum_content_releases_status" ADD VALUE IF NOT EXISTS 'blocked';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'content-release-execute';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'content-release-execute';
    ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "execution_job_id" uuid;
    ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "execution_items" jsonb DEFAULT '[]'::jsonb NOT NULL;
    ALTER TABLE "content_releases" ADD COLUMN IF NOT EXISTS "execution_audit" jsonb DEFAULT '[]'::jsonb NOT NULL;
    DO $$ BEGIN
      ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_execution_job_id_payload_jobs_id_fk"
        FOREIGN KEY ("execution_job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "content_releases_execution_job_idx" ON "content_releases" USING btree ("execution_job_id");
  `)},down:async function a(a){throw Error("20260829_110000_content_release_execution is additive; rollback requires a reviewed data migration.")},name:"20260829_110000_content_release_execution"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TYPE "public"."enum_quality_issues_workflow_state" AS ENUM('new', 'assigned', 'in_remediation', 'ready_for_rescan');
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'quality-scan';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'quality-scan';
    ALTER TABLE "quality_scans" ADD COLUMN IF NOT EXISTS "job_id" uuid;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "workflow_state" "enum_quality_issues_workflow_state" DEFAULT 'new' NOT NULL;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "category" varchar DEFAULT 'content' NOT NULL;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp(3) with time zone DEFAULT now() NOT NULL;
    DO $$ BEGIN
      ALTER TABLE "quality_scans" ADD CONSTRAINT "quality_scans_job_id_payload_jobs_id_fk"
        FOREIGN KEY ("job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "quality_scans_job_idx" ON "quality_scans" USING btree ("job_id");
    CREATE INDEX IF NOT EXISTS "quality_issues_target_status_idx" ON "quality_issues" USING btree ("target_type", "target_id", "status");
  `)},down:async function a(a){throw Error("20260829_120000_quality_runtime is additive; rollback requires a reviewed data migration.")},name:"20260829_120000_quality_runtime"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "site_settings"
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_media_processing" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_social_distribution" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_transactional_email" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_commerce_checkout" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_analytics_reporting" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_experiments" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "admin_experience_optional_capabilities_quality_scanning" boolean DEFAULT false;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "site_settings"
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_media_processing",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_social_distribution",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_transactional_email",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_commerce_checkout",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_analytics_reporting",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_experiments",
      DROP COLUMN IF EXISTS "admin_experience_optional_capabilities_quality_scanning";
  `)},name:"20260829_130000_progressive_disclosure_admin"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "onboarding_primary_url" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_locale" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_timezone" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_feature_profile" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_starter_type" varchar,
      ADD COLUMN IF NOT EXISTS "onboarding_starter_content" boolean DEFAULT true;`)},down:async function a({db:b}){await b.execute(aa.sql`ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "onboarding_primary_url", DROP COLUMN IF EXISTS "onboarding_locale", DROP COLUMN IF EXISTS "onboarding_timezone", DROP COLUMN IF EXISTS "onboarding_feature_profile", DROP COLUMN IF EXISTS "onboarding_starter_type", DROP COLUMN IF EXISTS "onboarding_starter_content";`)},name:"20260829_140000_onboarding_settings"},{up:async function a({db:b}){await b.execute(`
    CREATE TABLE IF NOT EXISTS "api_clients" (
      "id" uuid PRIMARY KEY NOT NULL, "site_id" uuid NOT NULL, "publication_id" uuid, "space_id" uuid,
      "name" varchar NOT NULL, "token_prefix" varchar NOT NULL, "token_hash" varchar NOT NULL, "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "expires_at" timestamp(3) with time zone, "revoked_at" timestamp(3) with time zone, "last_used_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
      "id" uuid PRIMARY KEY NOT NULL, "site_id" uuid NOT NULL, "publication_id" uuid, "space_id" uuid, "events" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "target" varchar NOT NULL, "secret_ref" varchar NOT NULL, "status" varchar DEFAULT 'active' NOT NULL, "failure_count" numeric DEFAULT 0 NOT NULL, "rotated_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
      "id" uuid PRIMARY KEY NOT NULL, "subscription_id" uuid NOT NULL, "event_id" varchar NOT NULL, "event_type" varchar NOT NULL, "idempotency_key" varchar NOT NULL,
      "state" varchar DEFAULT 'queued' NOT NULL, "attempts" numeric DEFAULT 0 NOT NULL, "next_attempt_at" timestamp(3) with time zone, "redacted_response" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "integration_audit_events" (
      "id" uuid PRIMARY KEY NOT NULL, "site_id" uuid NOT NULL, "publication_id" uuid, "space_id" uuid, "action" varchar NOT NULL, "client_id" uuid,
      "subject" jsonb, "outcome" varchar NOT NULL, "occurred_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_settings" (
      "id" serial PRIMARY KEY NOT NULL,
      "canonical_origin" varchar,
      "enabled_protocols" jsonb DEFAULT '[]'::jsonb,
      "registration_policy" varchar DEFAULT 'closed',
      "remote_policy" jsonb DEFAULT '{"default":"allow"}'::jsonb,
      "public_contact" jsonb,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );
    CREATE TABLE IF NOT EXISTS "network_signing_keys" (
      "id" uuid PRIMARY KEY NOT NULL,
      "key_id" varchar NOT NULL,
      "algorithm" varchar NOT NULL,
      "public_key" varchar NOT NULL,
      "state" varchar DEFAULT 'active' NOT NULL,
      "not_before" timestamp(3) with time zone NOT NULL,
      "retired_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "remote_instances" (
      "id" uuid PRIMARY KEY NOT NULL,
      "origin" varchar NOT NULL,
      "status" varchar DEFAULT 'unknown' NOT NULL,
      "metadata" jsonb,
      "last_seen_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "remote_actors" (
      "id" uuid PRIMARY KEY NOT NULL,
      "instance_id" uuid NOT NULL,
      "canonical_id" varchar NOT NULL,
      "handle" varchar,
      "profile" jsonb,
      "last_fetched_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "remote_objects" (
      "id" uuid PRIMARY KEY NOT NULL,
      "instance_id" uuid NOT NULL,
      "actor_id" uuid,
      "canonical_id" varchar NOT NULL,
      "object_type" varchar,
      "reference" jsonb,
      "last_fetched_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_relationships" (
      "id" uuid PRIMARY KEY NOT NULL,
      "local_subject_type" varchar NOT NULL,
      "local_subject_id" varchar NOT NULL,
      "remote_actor_id" uuid NOT NULL,
      "kind" varchar NOT NULL,
      "state" varchar DEFAULT 'pending' NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "inbound_network_activities" (
      "id" uuid PRIMARY KEY NOT NULL,
      "protocol" varchar NOT NULL,
      "remote_actor_id" uuid,
      "remote_activity_id" varchar NOT NULL,
      "dedupe_key" varchar NOT NULL,
      "received_at" timestamp(3) with time zone NOT NULL,
      "status" varchar DEFAULT 'received' NOT NULL,
      "envelope" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "outbound_network_deliveries" (
      "id" uuid PRIMARY KEY NOT NULL,
      "protocol" varchar NOT NULL,
      "remote_instance_id" uuid NOT NULL,
      "target" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "status" varchar DEFAULT 'queued' NOT NULL,
      "envelope" jsonb NOT NULL,
      "next_attempt_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_delivery_attempts" (
      "id" uuid PRIMARY KEY NOT NULL,
      "delivery_id" uuid NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "attempt" numeric NOT NULL,
      "started_at" timestamp(3) with time zone NOT NULL,
      "finished_at" timestamp(3) with time zone,
      "outcome" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_access_decisions" (
      "id" uuid PRIMARY KEY NOT NULL,
      "subject" varchar NOT NULL,
      "subject_type" varchar NOT NULL,
      "decision" varchar NOT NULL,
      "reason" varchar,
      "expires_at" timestamp(3) with time zone,
      "note" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_audit_events" (
      "id" uuid PRIMARY KEY NOT NULL,
      "action" varchar NOT NULL,
      "subject" varchar NOT NULL,
      "actor_id" uuid,
      "details" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "api_clients_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "webhook_subscriptions_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "webhook_deliveries_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "integration_audit_events_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_signing_keys_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "remote_instances_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "remote_actors_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "remote_objects_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_relationships_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "inbound_network_activities_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "outbound_network_deliveries_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_delivery_attempts_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_access_decisions_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_audit_events_id" uuid;

    DO $$ BEGIN ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscriptions"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "integration_audit_events" ADD CONSTRAINT "integration_audit_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "integration_audit_events" ADD CONSTRAINT "integration_audit_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "integration_audit_events" ADD CONSTRAINT "integration_audit_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "integration_audit_events" ADD CONSTRAINT "integration_audit_events_client_id_api_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."api_clients"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "remote_actors" ADD CONSTRAINT "remote_actors_instance_id_remote_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."remote_instances"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "remote_objects" ADD CONSTRAINT "remote_objects_instance_id_remote_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."remote_instances"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "remote_objects" ADD CONSTRAINT "remote_objects_actor_id_remote_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."remote_actors"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "network_relationships" ADD CONSTRAINT "network_relationships_remote_actor_id_remote_actors_id_fk" FOREIGN KEY ("remote_actor_id") REFERENCES "public"."remote_actors"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "inbound_network_activities" ADD CONSTRAINT "inbound_network_activities_remote_actor_id_remote_actors_id_fk" FOREIGN KEY ("remote_actor_id") REFERENCES "public"."remote_actors"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "outbound_network_deliveries" ADD CONSTRAINT "outbound_network_deliveries_remote_instance_id_remote_instances_id_fk" FOREIGN KEY ("remote_instance_id") REFERENCES "public"."remote_instances"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "network_delivery_attempts" ADD CONSTRAINT "network_delivery_attempts_delivery_id_outbound_network_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."outbound_network_deliveries"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS "api_clients_token_prefix_idx" ON "api_clients" USING btree ("token_prefix");
    CREATE INDEX IF NOT EXISTS "api_clients_site_idx" ON "api_clients" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "webhook_subscriptions_site_idx" ON "webhook_subscriptions" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "webhook_deliveries_event_id_idx" ON "webhook_deliveries" USING btree ("event_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_idempotency_key_idx" ON "webhook_deliveries" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "integration_audit_events_site_idx" ON "integration_audit_events" USING btree ("site_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "network_signing_keys_key_id_idx" ON "network_signing_keys" USING btree ("key_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "remote_instances_origin_idx" ON "remote_instances" USING btree ("origin");
    CREATE UNIQUE INDEX IF NOT EXISTS "remote_actors_canonical_id_idx" ON "remote_actors" USING btree ("canonical_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "remote_objects_canonical_id_idx" ON "remote_objects" USING btree ("canonical_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "network_relationships_idempotency_key_idx" ON "network_relationships" USING btree ("idempotency_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "inbound_network_activities_dedupe_key_idx" ON "inbound_network_activities" USING btree ("dedupe_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "outbound_network_deliveries_idempotency_key_idx" ON "outbound_network_deliveries" USING btree ("idempotency_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "network_access_decisions_subject_idx" ON "network_access_decisions" USING btree ("subject");
  `)},down:async function a({db:b}){await b.execute(`
    DROP TABLE IF EXISTS "network_audit_events" CASCADE;
    DROP TABLE IF EXISTS "network_access_decisions" CASCADE;
    DROP TABLE IF EXISTS "network_delivery_attempts" CASCADE;
    DROP TABLE IF EXISTS "outbound_network_deliveries" CASCADE;
    DROP TABLE IF EXISTS "inbound_network_activities" CASCADE;
    DROP TABLE IF EXISTS "network_relationships" CASCADE;
    DROP TABLE IF EXISTS "remote_objects" CASCADE;
    DROP TABLE IF EXISTS "remote_actors" CASCADE;
    DROP TABLE IF EXISTS "remote_instances" CASCADE;
    DROP TABLE IF EXISTS "network_signing_keys" CASCADE;
    DROP TABLE IF EXISTS "network_settings" CASCADE;
    DROP TABLE IF EXISTS "integration_audit_events" CASCADE;
    DROP TABLE IF EXISTS "webhook_deliveries" CASCADE;
    DROP TABLE IF EXISTS "webhook_subscriptions" CASCADE;
    DROP TABLE IF EXISTS "api_clients" CASCADE;
  `)},name:"20260829_150000_integrations"},{up:async function a({db:b}){await b.execute(`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'network-delivery';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'network-delivery';
  `)},down:async function a(a){},name:"20260829_160000_activitypub_delivery"},{up:async function a({db:b}){await b.execute(`
    ALTER TABLE "remote_instances" ADD COLUMN IF NOT EXISTS "moderation_note" varchar;
    ALTER TABLE "remote_actors" ADD COLUMN IF NOT EXISTS "moderation_note" varchar;
    ALTER TABLE "remote_objects" ADD COLUMN IF NOT EXISTS "visibility" varchar DEFAULT 'visible' NOT NULL;
    ALTER TABLE "network_relationships" ADD COLUMN IF NOT EXISTS "remote_activity_id" varchar;
    ALTER TABLE "network_relationships" ADD COLUMN IF NOT EXISTS "ended_at" timestamp(3) with time zone;
    ALTER TABLE "network_relationships" ADD COLUMN IF NOT EXISTS "direction" varchar DEFAULT 'outbound' NOT NULL;
    CREATE INDEX IF NOT EXISTS "remote_objects_visibility_idx" ON "remote_objects" USING btree ("visibility");
  `)},down:async function a({db:b}){await b.execute(`
    DROP INDEX IF EXISTS "remote_objects_visibility_idx";
    ALTER TABLE "network_relationships" DROP COLUMN IF EXISTS "ended_at";
    ALTER TABLE "network_relationships" DROP COLUMN IF EXISTS "remote_activity_id";
    ALTER TABLE "network_relationships" DROP COLUMN IF EXISTS "direction";
    ALTER TABLE "remote_objects" DROP COLUMN IF EXISTS "visibility";
    ALTER TABLE "remote_actors" DROP COLUMN IF EXISTS "moderation_note";
    ALTER TABLE "remote_instances" DROP COLUMN IF EXISTS "moderation_note";
  `)},name:"20260829_170000_network_experience"},{up:async function a({db:b}){await b.execute(`
    ALTER TYPE "public"."enum_users_role" ADD VALUE IF NOT EXISTS 'administrator';
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "member_id" uuid;
    CREATE UNIQUE INDEX IF NOT EXISTS "users_member_idx" ON "users" USING btree ("member_id");
    CREATE TABLE IF NOT EXISTS "team_memberships" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "member_id" uuid NOT NULL,
      "role" varchar NOT NULL,
      "grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "status" varchar DEFAULT 'active' NOT NULL,
      "accepted_at" timestamp(3) with time zone,
      "revoked_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "team_invitations" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "email_hash" varchar NOT NULL,
      "token_hash" varchar NOT NULL,
      "role" varchar NOT NULL,
      "grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "accepted_at" timestamp(3) with time zone,
      "accepted_by_id" uuid,
      "revoked_at" timestamp(3) with time zone,
      "created_by_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "team_audit_events" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "action" varchar NOT NULL,
      "actor_member_id" uuid,
      "subject_member_id" uuid,
      "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "editorial_assignments" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "content_id" uuid NOT NULL,
      "article_id" uuid,
      "revision_id" uuid,
      "title" varchar NOT NULL,
      "assignee_id" uuid NOT NULL,
      "assigned_by_id" uuid NOT NULL,
      "due_at" timestamp(3) with time zone,
      "status" varchar DEFAULT 'open' NOT NULL,
      "metadata" jsonb DEFAULT '{}'::jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "editorial_discussions" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "content_id" uuid NOT NULL,
      "article_id" uuid,
      "revision_id" uuid,
      "subject" varchar NOT NULL,
      "state" varchar DEFAULT 'open' NOT NULL,
      "opened_by_id" uuid NOT NULL,
      "resolved_by_id" uuid,
      "resolved_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "editorial_comments" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "discussion_id" uuid NOT NULL,
      "author_id" uuid NOT NULL,
      "body" varchar NOT NULL,
      "reply_to_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "editorial_comments_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL,
      "path" varchar NOT NULL,
      "members_id" uuid
    );
    CREATE TABLE IF NOT EXISTS "work_conversations" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "title" varchar NOT NULL,
      "content_id" uuid,
      "article_id" uuid,
      "revision_id" uuid,
      "status" varchar DEFAULT 'open' NOT NULL,
      "private_only" boolean DEFAULT true NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "work_conversations_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL,
      "path" varchar NOT NULL,
      "members_id" uuid
    );
    CREATE TABLE IF NOT EXISTS "work_messages" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "conversation_id" uuid NOT NULL,
      "author_id" uuid NOT NULL,
      "body" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "work_messages_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL,
      "path" varchar NOT NULL,
      "members_id" uuid
    );

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "team_memberships_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "team_invitations_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "team_audit_events_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "editorial_assignments_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "editorial_discussions_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "editorial_comments_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "work_conversations_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "work_messages_id" uuid;

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "users_id" uuid;

    CREATE UNIQUE INDEX IF NOT EXISTS "team_memberships_scope_key_member_idx" ON "team_memberships" USING btree ("scope_key", "member_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_token_hash_idx" ON "team_invitations" USING btree ("token_hash");
    CREATE INDEX IF NOT EXISTS "team_invitations_email_hash_idx" ON "team_invitations" USING btree ("email_hash");
    CREATE INDEX IF NOT EXISTS "team_audit_events_scope_key_idx" ON "team_audit_events" USING btree ("scope_key");
  `)},down:async function a({db:b}){await b.execute(`
    DROP TABLE IF EXISTS "work_messages_rels" CASCADE;
    DROP TABLE IF EXISTS "work_messages" CASCADE;
    DROP TABLE IF EXISTS "work_conversations_rels" CASCADE;
    DROP TABLE IF EXISTS "work_conversations" CASCADE;
    DROP TABLE IF EXISTS "editorial_comments_rels" CASCADE;
    DROP TABLE IF EXISTS "editorial_comments" CASCADE;
    DROP TABLE IF EXISTS "editorial_discussions" CASCADE;
    DROP TABLE IF EXISTS "editorial_assignments" CASCADE;
    DROP TABLE IF EXISTS "team_audit_events" CASCADE;
    DROP TABLE IF EXISTS "team_invitations" CASCADE;
    DROP TABLE IF EXISTS "team_memberships" CASCADE;
    DROP INDEX IF EXISTS "users_member_idx";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "member_id";
  `)},name:"20260829_180000_collaboration"},{up:async function a({db:b}){await b.execute(`
    CREATE TABLE IF NOT EXISTS "realtime_events" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "sequence" bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
      "kind" varchar NOT NULL,
      "recipient_member_id" uuid,
      "article_id" uuid,
      "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "realtime_events_recipient_sequence_idx" ON "realtime_events" ("recipient_member_id", "sequence");
    CREATE INDEX IF NOT EXISTS "realtime_events_scope_sequence_idx" ON "realtime_events" ("scope_key", "sequence");
    CREATE TABLE IF NOT EXISTS "realtime_presence" (
      "id" uuid PRIMARY KEY NOT NULL,
      "scope_kind" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "publication_id" uuid,
      "space_id" uuid,
      "scope_key" varchar NOT NULL,
      "member_id" uuid NOT NULL,
      "article_id" uuid NOT NULL,
      "client_id" varchar NOT NULL,
      "mode" varchar NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "last_heartbeat_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      UNIQUE ("member_id", "article_id", "client_id")
    );
    CREATE INDEX IF NOT EXISTS "realtime_presence_article_expiry_idx" ON "realtime_presence" ("article_id", "expires_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "realtime_events_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "realtime_presence_id" uuid;
  `)},down:async function a({db:b}){await b.execute(`
    DROP TABLE IF EXISTS "realtime_presence" CASCADE;
    DROP TABLE IF EXISTS "realtime_events" CASCADE;
  `)},name:"20260830_090000_realtime_collaboration"},{up:async function a({db:b}){await b.execute(`
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "checksum" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "focal_point_x" numeric;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "focal_point_y" numeric;
  `)},down:async function a({db:b}){await b.execute(`
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "focal_point_y";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "focal_point_x";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "checksum";
  `)},name:"20260830_100000_media_storage_workflow"},{up:async function a({db:b}){await b.execute(`
    DO $$ BEGIN CREATE TYPE "public"."enum_public_redirects_match" AS ENUM ('exact', 'prefix', 'regex'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_public_redirects_status_code" AS ENUM ('301', '302', '307', '308'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE IF NOT EXISTS "public_redirects" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "from_path" varchar NOT NULL, "to_path" varchar NOT NULL, "match" "enum_public_redirects_match" DEFAULT 'exact' NOT NULL,
      "status_code" "enum_public_redirects_status_code" DEFAULT '308' NOT NULL, "preserve_query" boolean DEFAULT true, "enabled" boolean DEFAULT true,
      "hit_count" numeric DEFAULT 0 NOT NULL, "last_hit_at" timestamp(3) with time zone, "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "public_redirects_site_from_path_idx" ON "public_redirects" ("site_id", "from_path");
  `)},down:async function a({db:b}){await b.execute('DROP TABLE IF EXISTS "public_redirects" CASCADE; DROP TYPE IF EXISTS "public"."enum_public_redirects_match"; DROP TYPE IF EXISTS "public"."enum_public_redirects_status_code";')},name:"20260830_110000_discoverability"},{up:async function a({db:b}){await b.execute(`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "public_redirects_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_public_redirects_fk" FOREIGN KEY ("public_redirects_id") REFERENCES "public_redirects"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_public_redirects_id_idx" ON "payload_locked_documents_rels" ("public_redirects_id");
  `)},down:async function a({db:b}){await b.execute('ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_public_redirects_fk"; DROP INDEX IF EXISTS "payload_locked_documents_rels_public_redirects_id_idx"; ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "public_redirects_id";')},name:"20260830_120000_discoverability_lock_relation"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_users_role" ADD VALUE IF NOT EXISTS 'administrator';
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "name" varchar NOT NULL DEFAULT 'Passkey';
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp(3) with time zone;
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "transports" jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "registration_challenge" varchar;
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "registration_expires_at" timestamp(3) with time zone;
    ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "login_expires_at" timestamp(3) with time zone;
    CREATE TABLE IF NOT EXISTS "admin_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "revoked_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "last_seen_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "admin_sessions" ADD COLUMN IF NOT EXISTS "registration_challenge" varchar;
    ALTER TABLE "admin_sessions" ADD COLUMN IF NOT EXISTS "registration_expires_at" timestamp(3) with time zone;
    CREATE TABLE IF NOT EXISTS "admin_auth_audit_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "event" varchar NOT NULL,
      "credential_id" varchar,
      "ip_hash" varchar,
      "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "admin_auth_rate_limits" (
      "key" varchar PRIMARY KEY NOT NULL,
      "window_started_at" timestamp(3) with time zone NOT NULL,
      "attempts" integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS "admin_sessions_user_id_idx" ON "admin_sessions" ("user_id");
    CREATE INDEX IF NOT EXISTS "admin_auth_audit_events_user_id_idx" ON "admin_auth_audit_events" ("user_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "admin_auth_rate_limits";
    DROP TABLE IF EXISTS "admin_auth_audit_events";
    DROP TABLE IF EXISTS "admin_sessions";
    ALTER TABLE "passkeys" DROP COLUMN IF EXISTS "registration_expires_at", DROP COLUMN IF EXISTS "registration_challenge", DROP COLUMN IF EXISTS "transports", DROP COLUMN IF EXISTS "last_used_at", DROP COLUMN IF EXISTS "name";
  `)},name:"20260830_130000_admin_auth_hardening"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'execution-outbox-dispatch';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'execution-outbox-handle';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'execution-outbox-dispatch';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'execution-outbox-handle';
    CREATE TYPE "public"."enum_execution_events_privacy_class" AS ENUM('public', 'internal', 'restricted');
    CREATE TYPE "public"."enum_execution_events_state" AS ENUM('ready', 'dispatched', 'retrying', 'processed', 'dead-letter', 'cancelled');
    CREATE TABLE "execution_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "tenant_id" varchar NOT NULL,
      "actor" jsonb NOT NULL,
      "event_type" varchar NOT NULL,
      "event_version" numeric NOT NULL DEFAULT 1,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "correlation_id" varchar NOT NULL,
      "causation_id" varchar,
      "idempotency_key" varchar NOT NULL,
      "privacy_class" "enum_execution_events_privacy_class" NOT NULL DEFAULT 'internal',
      "payload" jsonb NOT NULL,
      "state" "enum_execution_events_state" NOT NULL DEFAULT 'ready',
      "attempts" numeric NOT NULL DEFAULT 0,
      "last_error" varchar,
      "job_id" varchar,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX "execution_events_idempotency_key_idx" ON "execution_events" USING btree ("idempotency_key");
    CREATE INDEX "execution_events_site_state_created_at_idx" ON "execution_events" USING btree ("site_id", "state", "created_at");
    CREATE INDEX "execution_events_tenant_type_created_at_idx" ON "execution_events" USING btree ("tenant_id", "event_type", "created_at");
    CREATE INDEX "execution_events_event_type_idx" ON "execution_events" USING btree ("event_type");
    CREATE INDEX "execution_events_occurred_at_idx" ON "execution_events" USING btree ("occurred_at");
    CREATE INDEX "execution_events_correlation_id_idx" ON "execution_events" USING btree ("correlation_id");
    CREATE INDEX "execution_events_causation_id_idx" ON "execution_events" USING btree ("causation_id");
    CREATE INDEX "execution_events_state_idx" ON "execution_events" USING btree ("state");
    CREATE INDEX "execution_events_job_id_idx" ON "execution_events" USING btree ("job_id");
    CREATE INDEX "execution_events_updated_at_idx" ON "execution_events" USING btree ("updated_at");
    CREATE INDEX "execution_events_created_at_idx" ON "execution_events" USING btree ("created_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "execution_events_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_execution_events_fk" FOREIGN KEY ("execution_events_id") REFERENCES "execution_events"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_execution_events_id_idx" ON "payload_locked_documents_rels" ("execution_events_id");
  `)},down:async function a(a){throw Error("20260831_090000_phase_b_execution_foundation is additive; rollback requires a reviewed data migration.")},name:"20260831_090000_phase_b_execution_foundation"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_analytics_enabled" boolean DEFAULT false NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_consent_version" varchar DEFAULT '2026-08-31' NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_respect_global_privacy_control" boolean DEFAULT true NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_respect_do_not_track" boolean DEFAULT true NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_raw_event_retention_days" numeric DEFAULT 90 NOT NULL;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "privacy_rollup_retention_days" numeric DEFAULT 730 NOT NULL;
    CREATE TYPE "public"."enum_analytics_consent_records_action" AS ENUM('grant', 'update', 'withdraw');
    CREATE TABLE "analytics_consent_records" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE set null,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE set null,
      "subject_hash" varchar NOT NULL, "consent_version" varchar NOT NULL,
      "action" "enum_analytics_consent_records_action" NOT NULL, "categories" jsonb NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL, "source" varchar NOT NULL DEFAULT 'browser',
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX "analytics_consent_records_site_subject_occurred_idx" ON "analytics_consent_records" USING btree ("site_id", "subject_hash", "occurred_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "analytics_consent_records_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_consent_records_fk" FOREIGN KEY ("analytics_consent_records_id") REFERENCES "analytics_consent_records"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_analytics_consent_records_id_idx" ON "payload_locked_documents_rels" ("analytics_consent_records_id");
  `)},down:async function a(a){throw Error("Analytics privacy records are immutable audit evidence; use a reviewed retention migration.")},name:"20260831_100000_analytics_privacy_runtime"},{up:async function a({db:b}){await b.execute(`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "venue_address" varchar,
      ADD COLUMN IF NOT EXISTS "online_url" varchar,
      ADD COLUMN IF NOT EXISTS "organizer_name" varchar,
      ADD COLUMN IF NOT EXISTS "organizer_url" varchar,
      ADD COLUMN IF NOT EXISTS "capacity" numeric,
      ADD COLUMN IF NOT EXISTS "registration_url" varchar,
      ADD COLUMN IF NOT EXISTS "recurrence" jsonb,
      ADD COLUMN IF NOT EXISTS "recurrence_overrides" jsonb;
    CREATE TABLE IF NOT EXISTS "events_rels" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "categories_id" uuid REFERENCES "categories"("id") ON DELETE cascade,
      "content_id" uuid REFERENCES "content"("id") ON DELETE cascade,
      "events_id" uuid REFERENCES "events"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "events_rels_parent_idx" ON "events_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "events_rels_categories_idx" ON "events_rels" ("categories_id");
    CREATE INDEX IF NOT EXISTS "events_rels_content_idx" ON "events_rels" ("content_id");
    CREATE INDEX IF NOT EXISTS "events_rels_events_idx" ON "events_rels" ("events_id");
  `)},down:async function a({db:b}){await b.execute('DROP TABLE IF EXISTS "events_rels" CASCADE; ALTER TABLE "events" DROP COLUMN IF EXISTS "venue_address", DROP COLUMN IF EXISTS "online_url", DROP COLUMN IF EXISTS "organizer_name", DROP COLUMN IF EXISTS "organizer_url", DROP COLUMN IF EXISTS "capacity", DROP COLUMN IF EXISTS "registration_url", DROP COLUMN IF EXISTS "recurrence", DROP COLUMN IF EXISTS "recurrence_overrides";')},name:"20260831_110000_events_workflow"},{up:async function a({db:b}){await b.execute(`
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "import_ownership" varchar DEFAULT 'local';
    ALTER TABLE "podcast_shows" ADD COLUMN IF NOT EXISTS "import_source_checksum" varchar;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "enclosure_bytes" numeric;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "enclosure_mime_type" varchar;
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "import_source_checksum" varchar;
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "native_media_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL;
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "availability" varchar DEFAULT 'available';
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "provider_source_checksum" varchar;
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "sync_claimed" boolean DEFAULT false;
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    CREATE TABLE IF NOT EXISTS "videos_rels" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "media_assets_id" uuid REFERENCES "media_assets"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "videos_rels_parent_idx" ON "videos_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "videos_rels_media_assets_idx" ON "videos_rels" ("media_assets_id");
  `)},down:async function a({db:b}){await b.execute(`
    ALTER TABLE "podcast_shows" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at", DROP COLUMN IF EXISTS "import_ownership", DROP COLUMN IF EXISTS "import_source_checksum";
    ALTER TABLE "podcast_episodes" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at", DROP COLUMN IF EXISTS "enclosure_bytes", DROP COLUMN IF EXISTS "enclosure_mime_type", DROP COLUMN IF EXISTS "import_source_checksum";
    ALTER TABLE "videos" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at", DROP COLUMN IF EXISTS "native_media_id", DROP COLUMN IF EXISTS "availability", DROP COLUMN IF EXISTS "provider_source_checksum";
    ALTER TABLE "video_channels" DROP COLUMN IF EXISTS "sync_claimed";
    ALTER TABLE "video_channels" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at";
    ALTER TABLE "video_playlists" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at";
    ALTER TABLE "interviews" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at";
    ALTER TABLE "livestreams" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "published_at";
    DROP TABLE IF EXISTS "videos_rels" CASCADE;
  `)},name:"20260831_120000_media_publishing_workflows"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_quality_scans_target_type" ADD VALUE IF NOT EXISTS 'book';
    ALTER TYPE "public"."enum_quality_scans_target_type" ADD VALUE IF NOT EXISTS 'book-chapter';
    ALTER TYPE "public"."enum_quality_scans_status" ADD VALUE IF NOT EXISTS 'stale';
    ALTER TYPE "public"."enum_quality_issues_status" ADD VALUE IF NOT EXISTS 'ignored';
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft' NOT NULL;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "visibility" varchar DEFAULT 'public' NOT NULL;
    ALTER TABLE "book_chapters" ADD COLUMN IF NOT EXISTS "slug" varchar;
    ALTER TABLE "book_chapters" ADD COLUMN IF NOT EXISTS "canonical_path" varchar;
    ALTER TABLE "book_chapters" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft' NOT NULL;
    ALTER TABLE "book_chapters" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    UPDATE "book_chapters" SET "slug" = 'chapter-' || replace("id"::text, '-', '') WHERE "slug" IS NULL;
    UPDATE "book_chapters" c SET "canonical_path" = b."canonical_path" || '/' || c."slug" FROM "books" b WHERE c."book_id" = b."id" AND c."canonical_path" IS NULL;
    ALTER TABLE "book_chapters" ALTER COLUMN "slug" SET NOT NULL;
    ALTER TABLE "book_chapters" ALTER COLUMN "canonical_path" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "book_chapters_canonical_path_idx" ON "book_chapters" USING btree ("canonical_path");
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "repair_url" varchar;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "ignored_at" timestamp(3) with time zone;
    ALTER TABLE "quality_issues" ADD COLUMN IF NOT EXISTS "ignored_reason" varchar;
  `)},down:async function a(a){throw Error("20260831_130000_books_quality_center is additive; rollback requires a reviewed data migration.")},name:"20260831_130000_books_quality_center"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'webhook-delivery-dispatch';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'webhook-delivery-dispatch';
    ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "last_error" varchar;
    CREATE TABLE IF NOT EXISTS "api_request_records" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid, "space_id" uuid, "client_id" uuid NOT NULL REFERENCES "api_clients"("id") ON DELETE RESTRICT,
      "idempotency_key" varchar NOT NULL, "method" varchar NOT NULL, "path" varchar NOT NULL,
      "response_status" numeric NOT NULL, "response" jsonb NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "api_request_records_idempotency_key_idx" ON "api_request_records" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "api_request_records_site_idx" ON "api_request_records" USING btree ("site_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "api_request_records_id" uuid;
  `)},down:async function a(a){throw Error("20260831_140000_public_api_webhooks is additive; rollback requires a reviewed data migration.")},name:"20260831_140000_public_api_webhooks"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "execution_events_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_execution_events_fk" FOREIGN KEY ("execution_events_id") REFERENCES "execution_events"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_execution_events_id_idx" ON "payload_locked_documents_rels" ("execution_events_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "analytics_consent_records_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_consent_records_fk" FOREIGN KEY ("analytics_consent_records_id") REFERENCES "analytics_consent_records"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_analytics_consent_records_id_idx" ON "payload_locked_documents_rels" ("analytics_consent_records_id");
  `)},down:async function a(a){throw Error("Phase B lock relations are additive; rollback requires a reviewed data migration.")},name:"20260831_150000_phase_b_locked_document_relations"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft' NOT NULL;
    ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
  `)},down:async function a(a){throw Error("Phase B book lifecycle fields are additive; rollback requires a reviewed data migration.")},name:"20260831_160000_phase_b_book_lifecycle_reconciliation"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "video_playlists" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "description" varchar;
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'draft';
    ALTER TABLE "livestreams" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
  `)},down:async function a(a){throw Error("Phase B media lifecycle fields are additive; rollback requires a reviewed data migration.")},name:"20260831_170000_phase_b_scoped_media_reconciliation"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "videos_rels" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "media_assets_id" uuid REFERENCES "media_assets"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "videos_rels_parent_idx" ON "videos_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "videos_rels_media_assets_idx" ON "videos_rels" ("media_assets_id");
  `)},down:async function a(a){throw Error("Phase B video captions relation is additive; rollback requires a reviewed data migration.")},name:"20260831_180000_phase_b_video_captions_relation"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "api_clients" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
    ALTER TABLE "webhook_subscriptions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
    ALTER TABLE "webhook_deliveries" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
    ALTER TABLE "integration_audit_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
    ALTER TABLE "network_signing_keys" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
  `)},down:async function a(a){throw Error("Phase B integrations defaults are additive; rollback requires a reviewed data migration.")},name:"20260831_190000_phase_b_integrations_id_defaults"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "handle" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "links" jsonb;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "preferences" jsonb;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "moderation_reason" varchar;
    UPDATE "profiles" SET "handle" = 'member-' || substring(replace("member_id"::text, '-', '') from 1 for 12) WHERE "handle" IS NULL;
    ALTER TABLE "profiles" ALTER COLUMN "handle" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "profiles_handle_idx" ON "profiles" USING btree ("handle");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP INDEX IF EXISTS "profiles_handle_idx";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "preferences", DROP COLUMN IF EXISTS "links", DROP COLUMN IF EXISTS "handle";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "moderation_reason";
  `)},name:"20260831_200000_member_identity_foundation"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "path_override" boolean DEFAULT false NOT NULL;
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "parent_page_id" uuid;
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "page_template" varchar DEFAULT 'standard';
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "body" jsonb;

    UPDATE "content" AS c
    SET "body" = COALESCE(a."document" -> 'document', a."document")
    FROM "article_family_content" AS a
    WHERE a."content_id" = c."id" AND c."body" IS NULL;

    DROP INDEX IF EXISTS "content_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "content_site_canonical_path_idx"
      ON "content" USING btree ("site_id", "canonical_path");
    CREATE INDEX IF NOT EXISTS "content_parent_page_idx" ON "content" USING btree ("parent_page_id");
    DO $$ BEGIN
      ALTER TABLE "content" ADD CONSTRAINT "content_parent_page_id_content_id_fk"
        FOREIGN KEY ("parent_page_id") REFERENCES "public"."content"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)},down:async function a(a){throw Error("PUB-02 migrates canonical bodies; rollback requires a reviewed export.")},name:"20260902_000000_pub_02_content_publishing_pass"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "site_id" uuid;
    ALTER TABLE "spaces" ADD COLUMN IF NOT EXISTS "site_id" uuid;

    UPDATE "brands" AS brand
    SET "site_id" = (
      SELECT publication."site_id"
      FROM "publications" AS publication
      WHERE publication."brand_id" = brand."id"
      ORDER BY publication."created_at", publication."id"
      LIMIT 1
    )
    WHERE brand."site_id" IS NULL
      AND EXISTS (SELECT 1 FROM "publications" WHERE "brand_id" = brand."id");

    UPDATE "spaces" AS space
    SET "site_id" = (
      SELECT publication."site_id"
      FROM "publications" AS publication
      WHERE publication."space_id" = space."id"
      ORDER BY publication."created_at", publication."id"
      LIMIT 1
    )
    WHERE space."site_id" IS NULL
      AND EXISTS (SELECT 1 FROM "publications" WHERE "space_id" = space."id");

    UPDATE "brands"
    SET "site_id" = (SELECT "id" FROM "sites" LIMIT 1)
    WHERE "site_id" IS NULL AND (SELECT count(*) FROM "sites") = 1;
    UPDATE "spaces"
    SET "site_id" = (SELECT "id" FROM "sites" LIMIT 1)
    WHERE "site_id" IS NULL AND (SELECT count(*) FROM "sites") = 1;

    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "brands" WHERE "site_id" IS NULL)
        OR EXISTS (SELECT 1 FROM "spaces" WHERE "site_id" IS NULL) THEN
        RAISE EXCEPTION 'PUB-01 cannot infer a tenant site for every brand and space; assign their site before migrating.';
      END IF;
    END $$;

    ALTER TABLE "brands" ALTER COLUMN "site_id" SET NOT NULL;
    ALTER TABLE "spaces" ALTER COLUMN "site_id" SET NOT NULL;
    DO $$ BEGIN
      ALTER TABLE "brands" ADD CONSTRAINT "brands_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "spaces" ADD CONSTRAINT "spaces_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DROP INDEX IF EXISTS "spaces_handle_idx";
    DROP INDEX IF EXISTS "spaces_canonical_path_idx";
    CREATE INDEX IF NOT EXISTS "brands_site_idx" ON "brands" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "spaces_site_idx" ON "spaces" USING btree ("site_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "spaces_site_handle_idx" ON "spaces" USING btree ("site_id", "handle");
    CREATE UNIQUE INDEX IF NOT EXISTS "spaces_site_canonical_path_idx" ON "spaces" USING btree ("site_id", "canonical_path");
  `)},down:async function a(a){throw Error("PUB-01 establishes tenant ownership; restore from a reviewed backup to roll back.")},name:"20260902_010000_pub_01_canonical_tenant_isolation"},{up:async function({db:a}){await a.execute(aa.sql`
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "site_name" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "site_description" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "canonical_origin" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "locale" varchar DEFAULT 'en';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "timezone" varchar DEFAULT 'UTC';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "footer_text" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "indexing_mode" varchar DEFAULT 'index';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "homepage_selection_mode" varchar DEFAULT 'default';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "homepage_selection_page_id" uuid;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "homepage_selection_layout_id" uuid;

    DO $$ BEGIN
      ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_homepage_page_fk"
        FOREIGN KEY ("homepage_selection_page_id") REFERENCES "public"."content"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_homepage_layout_fk"
        FOREIGN KEY ("homepage_selection_layout_id") REFERENCES "public"."page_layouts"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    UPDATE "site_settings"
    SET "site_name" = COALESCE("site_name", "default_title", "organization_name", 'Renegade CMS'),
        "site_description" = COALESCE("site_description", "default_description", ''),
        "canonical_origin" = COALESCE("canonical_origin", "onboarding_primary_url", 'http://localhost:3000'),
        "locale" = COALESCE("locale", "onboarding_locale", 'en'),
        "timezone" = COALESCE("timezone", "onboarding_timezone", 'UTC'),
        "indexing_mode" = CASE WHEN "seo_no_index" = true THEN 'noindex' ELSE 'index' END
    WHERE "id" IS NOT NULL;
  `)},down:async function({db:a}){await a.execute(aa.sql`
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "site_name";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "site_description";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "canonical_origin";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "locale";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "timezone";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "footer_text";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "indexing_mode";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "homepage_selection_mode";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "homepage_selection_page_id";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "homepage_selection_layout_id";
  `)},name:"20260902_020000_pub_04_publishing_floor"},{up:async function a({db:b}){await b.execute(aa.sql`ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "theme_id" varchar DEFAULT 'neutral-starter';`)},down:async function a({db:b}){await b.execute(aa.sql`ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "theme_id";`)},name:"20260912_000000_pre_00_theme_selection"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS presentation_theme_state (
      site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      revision integer NOT NULL DEFAULT 0, active jsonb, draft jsonb, previous jsonb
    );
    CREATE TABLE IF NOT EXISTS presentation_theme_audit (
      id bigserial PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      actor_id text NOT NULL, action text NOT NULL, revision integer NOT NULL,
      configuration jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS presentation_theme_previews (
      token_hash text PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      actor_id text NOT NULL, configuration jsonb NOT NULL, expires_at timestamptz NOT NULL
    );
  `)},down:async function a({db:b}){await b.execute(aa.sql`DROP TABLE IF EXISTS presentation_theme_previews, presentation_theme_audit, presentation_theme_state;`)},name:"20260912_010000_pre_01_theme_lifecycle"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS published_presentation jsonb;
    UPDATE page_layouts SET published_presentation = jsonb_build_object(
      'version',1,'path',path,'visibility',visibility,'revision',COALESCE(published_revision,revision),
      'document',jsonb_build_object('version',1,'siteId',site_id,
        'theme',jsonb_build_object('id',theme_id,'version','1.0.0'),
        'template',jsonb_build_object('id','layout','version','1.0.0'),'surface','layout',
        'slots',jsonb_build_object('main',COALESCE(blocks,'[]'::jsonb) || COALESCE(unknown_blocks,'[]'::jsonb))))
    WHERE published_presentation IS NULL AND status='published' AND layout_version=1;
  `)},down:async function a({db:b}){await b.execute(aa.sql`ALTER TABLE page_layouts DROP COLUMN IF EXISTS published_presentation;`)},name:"20260912_020000_pre_01_presentation_snapshots"},{up:async function a({db:b}){await b.execute(aa.sql`
    DO $$ BEGIN CREATE TYPE "public"."enum_page_layouts_surface" AS ENUM('page', 'global');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "public"."enum_page_layouts_slot" AS ENUM('main', 'header', 'footer');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS surface "enum_page_layouts_surface" DEFAULT 'page' NOT NULL;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS slot "enum_page_layouts_slot" DEFAULT 'main' NOT NULL;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS slot;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS surface;
    DROP TYPE IF EXISTS "public"."enum_page_layouts_slot";
    DROP TYPE IF EXISTS "public"."enum_page_layouts_surface";
  `)},name:"20260912_030000_pre_03_visual_editor"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_page_layouts_surface" ADD VALUE IF NOT EXISTS 'template';
    ALTER TYPE "public"."enum_page_layouts_surface" ADD VALUE IF NOT EXISTS 'pattern';
    ALTER TYPE "public"."enum_page_layouts_slot" ADD VALUE IF NOT EXISTS 'announcement';
    ALTER TYPE "public"."enum_page_layouts_slot" ADD VALUE IF NOT EXISTS 'cta';

    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS name varchar;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS template_id varchar;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS template_version numeric;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS template_mode varchar;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS is_retired boolean DEFAULT false NOT NULL;
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS category varchar;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS category;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS is_retired;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS template_mode;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS template_version;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS template_id;
    ALTER TABLE page_layouts DROP COLUMN IF EXISTS name;
  `)},name:"20260912_040000_pre_04_reusable_composition"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS legacy_migration_runs (
      run_id text PRIMARY KEY,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      stage text NOT NULL,
      source_checksum text NOT NULL,
      options jsonb NOT NULL DEFAULT '{}'::jsonb,
      report jsonb NOT NULL DEFAULT '{}'::jsonb,
      checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_entity_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      activated_at timestamptz,
      rolled_back_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS legacy_migration_quarantine (
      id text PRIMARY KEY,
      run_id text NOT NULL REFERENCES legacy_migration_runs(run_id) ON DELETE CASCADE,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      source_id text NOT NULL,
      item_type text NOT NULL,
      title text,
      kind text NOT NULL,
      name text NOT NULL,
      raw_source text NOT NULL,
      location text,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_legacy_migration_runs_site ON legacy_migration_runs(site_id);
    CREATE INDEX IF NOT EXISTS idx_legacy_migration_quarantine_run ON legacy_migration_quarantine(run_id);
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS legacy_migration_quarantine;
    DROP TABLE IF EXISTS legacy_migration_runs;
  `)},name:"20260912_050000_pre_05_legacy_site_migration"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "media_blobs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "checksum" varchar NOT NULL, "storage_key" varchar NOT NULL UNIQUE,
      "storage_provider" varchar NOT NULL, "mime_type" varchar NOT NULL,
      "size_bytes" numeric NOT NULL, "state" varchar NOT NULL DEFAULT 'ready',
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "media_blobs_site_checksum_idx" ON "media_blobs" ("site_id", "checksum");
    CREATE TABLE IF NOT EXISTS "media_variants" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
      "blob_id" uuid NOT NULL REFERENCES "media_blobs"("id") ON DELETE RESTRICT,
      "label" varchar NOT NULL, "kind" varchar NOT NULL,
      "width" numeric, "height" numeric, "duration_seconds" numeric,
      "processing_state" varchar NOT NULL DEFAULT 'ready',
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "media_assets_storage_location_key";
    DROP INDEX IF EXISTS "media_assets_storage_location_idx";
    ALTER TABLE "media_assets" ALTER COLUMN "storage_location" DROP NOT NULL;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "original_blob_id" uuid REFERENCES "media_blobs"("id") ON DELETE RESTRICT;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "original_filename" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "rights_source_url" varchar;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "rights_expires_at" timestamptz;
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "processing_state" varchar NOT NULL DEFAULT 'ready';
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "public_policy" varchar NOT NULL DEFAULT 'published-use';
    CREATE INDEX IF NOT EXISTS "media_assets_original_blob_idx" ON "media_assets"("original_blob_id");
    ALTER TABLE "media_usages" ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE;
    ALTER TABLE "media_usages" ADD COLUMN IF NOT EXISTS "approved_for_public" boolean NOT NULL DEFAULT false;
    UPDATE "media_usages" usage SET "site_id" = asset."site_id"
      FROM "media_assets" asset WHERE usage."media_id" = asset."id" AND usage."site_id" IS NULL;
    CREATE INDEX IF NOT EXISTS "media_usages_site_idx" ON "media_usages"("site_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_blobs_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_blobs_fk" FOREIGN KEY ("media_blobs_id") REFERENCES "media_blobs"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_blobs_id_idx" ON "payload_locked_documents_rels" ("media_blobs_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_variants_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_variants_fk" FOREIGN KEY ("media_variants_id") REFERENCES "media_variants"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_variants_id_idx" ON "payload_locked_documents_rels" ("media_variants_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "page_layouts_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_page_layouts_fk" FOREIGN KEY ("page_layouts_id") REFERENCES "page_layouts"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_page_layouts_id_idx" ON "media_usages_rels" ("page_layouts_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "graphic_documents_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_graphic_documents_fk" FOREIGN KEY ("graphic_documents_id") REFERENCES "graphic_documents"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_graphic_documents_id_idx" ON "media_usages_rels" ("graphic_documents_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "podcast_episodes_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_podcast_episodes_fk" FOREIGN KEY ("podcast_episodes_id") REFERENCES "podcast_episodes"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_podcast_episodes_id_idx" ON "media_usages_rels" ("podcast_episodes_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "videos_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "videos"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_videos_id_idx" ON "media_usages_rels" ("videos_id");

    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "social_network_variants_id" uuid;
    DO $$ BEGIN ALTER TABLE "media_usages_rels" ADD CONSTRAINT "media_usages_rels_social_network_variants_fk" FOREIGN KEY ("social_network_variants_id") REFERENCES "social_network_variants"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_social_network_variants_id_idx" ON "media_usages_rels" ("social_network_variants_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_social_network_variants_fk";
    DROP INDEX IF EXISTS "media_usages_rels_social_network_variants_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "social_network_variants_id";
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_videos_fk";
    DROP INDEX IF EXISTS "media_usages_rels_videos_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "videos_id";
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_podcast_episodes_fk";
    DROP INDEX IF EXISTS "media_usages_rels_podcast_episodes_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "podcast_episodes_id";
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_graphic_documents_fk";
    DROP INDEX IF EXISTS "media_usages_rels_graphic_documents_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "graphic_documents_id";
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_page_layouts_fk";
    DROP INDEX IF EXISTS "media_usages_rels_page_layouts_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "page_layouts_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_variants_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_variants_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_variants_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_blobs_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_blobs_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_blobs_id";
    ALTER TABLE "media_usages" DROP COLUMN IF EXISTS "approved_for_public";
    ALTER TABLE "media_usages" DROP COLUMN IF EXISTS "site_id";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "public_policy";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "processing_state";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "rights_expires_at";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "rights_source_url";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "original_filename";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "original_blob_id";
    DROP TABLE IF EXISTS "media_variants";
    DROP TABLE IF EXISTS "media_blobs";
  `)},name:"20260912_060000_med_00_media_contract"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "media_upload_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "filename" varchar NOT NULL, "title" varchar NOT NULL, "alt_text" varchar, "caption" varchar,
      "expected_size" numeric NOT NULL, "expected_checksum" varchar, "chunk_size" numeric NOT NULL,
      "received_bytes" numeric NOT NULL DEFAULT 0, "received_chunks" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "state" varchar NOT NULL DEFAULT 'open', "asset_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
      "expires_at" timestamptz NOT NULL, "failure_reason" varchar,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "media_upload_sessions_expiry_idx" ON "media_upload_sessions" ("expires_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_upload_sessions_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_upload_sessions_fk" FOREIGN KEY ("media_upload_sessions_id") REFERENCES "media_upload_sessions"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_upload_sessions_id_idx" ON "payload_locked_documents_rels" ("media_upload_sessions_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_upload_sessions_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_upload_sessions_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_upload_sessions_id";
    DROP TABLE IF EXISTS "media_upload_sessions";
  `)},name:"20260912_070000_med_01_upload_sessions"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "description" varchar,
      ADD COLUMN IF NOT EXISTS "creator_credit" varchar,
      ADD COLUMN IF NOT EXISTS "source" varchar,
      ADD COLUMN IF NOT EXISTS "copyright_owner" varchar,
      ADD COLUMN IF NOT EXISTS "license_type" varchar,
      ADD COLUMN IF NOT EXISTS "license_url" varchar,
      ADD COLUMN IF NOT EXISTS "embargo_until" timestamptz,
      ADD COLUMN IF NOT EXISTS "usage_restrictions" varchar,
      ADD COLUMN IF NOT EXISTS "governance_enabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "consent_reference" varchar,
      ADD COLUMN IF NOT EXISTS "model_release_reference" varchar,
      ADD COLUMN IF NOT EXISTS "property_release_reference" varchar,
      ADD COLUMN IF NOT EXISTS "custom_metadata" jsonb;
    ALTER TABLE "media_usages"
      ADD COLUMN IF NOT EXISTS "target_type" varchar NOT NULL DEFAULT 'content',
      ADD COLUMN IF NOT EXISTS "target_id" varchar,
      ADD COLUMN IF NOT EXISTS "target_revision" varchar,
      ADD COLUMN IF NOT EXISTS "field" varchar,
      ADD COLUMN IF NOT EXISTS "slot" varchar,
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "channel" varchar,
      ADD COLUMN IF NOT EXISTS "lifecycle" varchar NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS "last_reconciled_at" timestamptz;
    UPDATE "media_usages" SET "target_id" = COALESCE("target_id", "usage_key") WHERE "target_id" IS NULL;
    ALTER TABLE "media_usages" ALTER COLUMN "target_id" SET NOT NULL;
    CREATE INDEX IF NOT EXISTS "media_usages_graph_idx" ON "media_usages" ("site_id", "media_id", "lifecycle");
    CREATE TABLE IF NOT EXISTS "media_asset_versions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "replaces_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "version_label" varchar NOT NULL, "mode" varchar NOT NULL,
      "replaced_usage_ids" jsonb, "impact_count" numeric NOT NULL DEFAULT 0, "reason" varchar,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "media_asset_versions_asset_idx" ON "media_asset_versions" ("asset_id");

    CREATE TABLE IF NOT EXISTS "media_governance_incidents" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "summary" varchar NOT NULL, "reason" varchar NOT NULL, "status" varchar NOT NULL DEFAULT 'open',
      "affected_usage_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "opened_at" timestamptz NOT NULL, "resolved_at" timestamptz, "resolution" varchar,
      "audit" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "media_governance_incidents_open_idx" ON "media_governance_incidents" ("site_id", "status");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_asset_versions_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_asset_versions_fk" FOREIGN KEY ("media_asset_versions_id") REFERENCES "media_asset_versions"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_asset_versions_id_idx" ON "payload_locked_documents_rels" ("media_asset_versions_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_governance_incidents_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_governance_incidents_fk" FOREIGN KEY ("media_governance_incidents_id") REFERENCES "media_governance_incidents"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_governance_incidents_id_idx" ON "payload_locked_documents_rels" ("media_governance_incidents_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_governance_incidents_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_governance_incidents_fk" FOREIGN KEY ("media_governance_incidents_id") REFERENCES "media_governance_incidents"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_governance_incidents_id_idx" ON "payload_locked_documents_rels" ("media_governance_incidents_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_governance_incidents_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_governance_incidents_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_governance_incidents_id";

    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_governance_incidents_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_governance_incidents_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_governance_incidents_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_media_asset_versions_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_media_asset_versions_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "media_asset_versions_id";

    DROP INDEX IF EXISTS "media_governance_incidents_open_idx";
    DROP TABLE IF EXISTS "media_governance_incidents";
    DROP TABLE IF EXISTS "media_asset_versions";
    DROP INDEX IF EXISTS "media_usages_graph_idx";
    ALTER TABLE "media_usages" DROP COLUMN IF EXISTS "last_reconciled_at", DROP COLUMN IF EXISTS "lifecycle", DROP COLUMN IF EXISTS "channel", DROP COLUMN IF EXISTS "publication_id", DROP COLUMN IF EXISTS "slot", DROP COLUMN IF EXISTS "field", DROP COLUMN IF EXISTS "target_revision", DROP COLUMN IF EXISTS "target_id", DROP COLUMN IF EXISTS "target_type";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "custom_metadata", DROP COLUMN IF EXISTS "property_release_reference", DROP COLUMN IF EXISTS "model_release_reference", DROP COLUMN IF EXISTS "consent_reference", DROP COLUMN IF EXISTS "governance_enabled", DROP COLUMN IF EXISTS "usage_restrictions", DROP COLUMN IF EXISTS "embargo_until", DROP COLUMN IF EXISTS "license_url", DROP COLUMN IF EXISTS "license_type", DROP COLUMN IF EXISTS "copyright_owner", DROP COLUMN IF EXISTS "source", DROP COLUMN IF EXISTS "creator_credit", DROP COLUMN IF EXISTS "description";
  `)},name:"20260913_080000_med_02_dam_governance"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'media-variant-generate';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'media-variant-generate';

    ALTER TABLE "media_variants"
      ADD COLUMN IF NOT EXISTS "format" varchar,
      ADD COLUMN IF NOT EXISTS "recipe_key" varchar,
      ADD COLUMN IF NOT EXISTS "recipe_version" numeric NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "previous_blob_id" uuid REFERENCES "media_blobs"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "crop" jsonb,
      ADD COLUMN IF NOT EXISTS "error_message" varchar,
      ADD COLUMN IF NOT EXISTS "size_bytes" numeric,
      ADD COLUMN IF NOT EXISTS "last_accessed_at" timestamptz;

    CREATE INDEX IF NOT EXISTS "media_variants_asset_recipe_idx"
      ON "media_variants" ("asset_id", "recipe_key", "format");

    CREATE INDEX IF NOT EXISTS "media_variants_processing_state_idx"
      ON "media_variants" ("processing_state");

    CREATE INDEX IF NOT EXISTS "media_variants_previous_blob_idx"
      ON "media_variants" ("previous_blob_id");

    ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "dominant_color" varchar,
      ADD COLUMN IF NOT EXISTS "color_palette" jsonb,
      ADD COLUMN IF NOT EXISTS "crop_settings" jsonb,
      ADD COLUMN IF NOT EXISTS "aspect_ratio" numeric,
      ADD COLUMN IF NOT EXISTS "audio_metadata" jsonb;

    ALTER TABLE "podcast_episodes_rels"
      ADD COLUMN IF NOT EXISTS "media_assets_id" uuid;

    ALTER TABLE "podcast_shows_rels"
      ADD COLUMN IF NOT EXISTS "categories_id" uuid;

    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "language" varchar DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS "explicit" boolean DEFAULT false;

    ALTER TABLE "podcast_episodes"
      ADD COLUMN IF NOT EXISTS "artwork_id" uuid,
      ADD COLUMN IF NOT EXISTS "explicit" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "language" varchar,
      ADD COLUMN IF NOT EXISTS "guid" varchar,
      ADD COLUMN IF NOT EXISTS "credits" varchar,
      ADD COLUMN IF NOT EXISTS "rights" jsonb;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP INDEX IF EXISTS "media_variants_processing_state_idx";
    DROP INDEX IF EXISTS "media_variants_asset_recipe_idx";
    DROP INDEX IF EXISTS "media_variants_previous_blob_idx";

    ALTER TABLE "media_assets"
      DROP COLUMN IF EXISTS "aspect_ratio",
      DROP COLUMN IF EXISTS "crop_settings",
      DROP COLUMN IF EXISTS "color_palette",
      DROP COLUMN IF EXISTS "dominant_color";

    ALTER TABLE "media_variants"
      DROP COLUMN IF EXISTS "last_accessed_at",
      DROP COLUMN IF EXISTS "previous_blob_id",
      DROP COLUMN IF EXISTS "size_bytes",
      DROP COLUMN IF EXISTS "error_message",
      DROP COLUMN IF EXISTS "crop",
      DROP COLUMN IF EXISTS "recipe_version",
      DROP COLUMN IF EXISTS "recipe_key",
      DROP COLUMN IF EXISTS "format";
  `)},name:"20260913_090000_med_03_image_variants"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "audio_metadata" jsonb;
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "language" varchar DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS "explicit" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "body" text;
    ALTER TABLE "podcast_episodes"
      ADD COLUMN IF NOT EXISTS "artwork_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "explicit" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "language" varchar,
      ADD COLUMN IF NOT EXISTS "guid" varchar,
      ADD COLUMN IF NOT EXISTS "credits" varchar,
      ADD COLUMN IF NOT EXISTS "rights" jsonb,
      ADD COLUMN IF NOT EXISTS "season_number" numeric,
      ADD COLUMN IF NOT EXISTS "body" text;
    CREATE UNIQUE INDEX IF NOT EXISTS "podcast_episodes_guid_idx" ON "podcast_episodes" ("guid") WHERE "guid" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "podcast_episodes_show_published_idx" ON "podcast_episodes" ("show_id", "published_at" DESC);
    ALTER TABLE "podcast_episodes_rels"
      ADD COLUMN IF NOT EXISTS "categories_id" uuid REFERENCES "categories"("id") ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS "podcast_episodes_rels_categories_id_idx" ON "podcast_episodes_rels" ("categories_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP INDEX IF EXISTS "podcast_episodes_rels_categories_id_idx";
    ALTER TABLE "podcast_episodes_rels" DROP COLUMN IF EXISTS "categories_id";
    DROP INDEX IF EXISTS "podcast_episodes_show_published_idx";
    DROP INDEX IF EXISTS "podcast_episodes_guid_idx";
    ALTER TABLE "podcast_episodes" DROP COLUMN IF EXISTS "body", DROP COLUMN IF EXISTS "season_number", DROP COLUMN IF EXISTS "rights", DROP COLUMN IF EXISTS "credits", DROP COLUMN IF EXISTS "guid", DROP COLUMN IF EXISTS "language", DROP COLUMN IF EXISTS "explicit", DROP COLUMN IF EXISTS "artwork_id";
    ALTER TABLE "podcast_shows" DROP COLUMN IF EXISTS "body", DROP COLUMN IF EXISTS "explicit", DROP COLUMN IF EXISTS "language";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "audio_metadata";
  `)},name:"20260913_100000_med_04_podcast_workflow"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "video_metadata" jsonb;
    ALTER TABLE "videos"
      ADD COLUMN IF NOT EXISTS "body" text,
      ADD COLUMN IF NOT EXISTS "visibility" varchar NOT NULL DEFAULT 'public',
      ADD COLUMN IF NOT EXISTS "rights" jsonb,
      ADD COLUMN IF NOT EXISTS "source_asset_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "poster_id" uuid REFERENCES "media_assets"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "distribution_clips" jsonb;
    ALTER TABLE "videos" ALTER COLUMN "external_id" DROP NOT NULL;
    ALTER TABLE "videos" ALTER COLUMN "provider_identity" DROP NOT NULL;
    CREATE TABLE IF NOT EXISTS "video_assets" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "title" varchar NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "source_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "processing_state" varchar NOT NULL DEFAULT 'uploaded', "recipe_key" varchar NOT NULL DEFAULT 'web-video-v1',
      "recipe_version" numeric NOT NULL DEFAULT 1, "metadata" jsonb, "outputs" jsonb, "last_good_outputs" jsonb,
      "progress" numeric DEFAULT 0, "attempts" numeric DEFAULT 0, "heartbeat_at" timestamptz,
      "failure" jsonb, "cancel_requested" boolean DEFAULT false, "updated_at" timestamptz NOT NULL DEFAULT now(), "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "video_assets_source_asset_idx" ON "video_assets" ("source_asset_id");
    CREATE INDEX IF NOT EXISTS "video_assets_site_idx" ON "video_assets" ("site_id");
    CREATE INDEX IF NOT EXISTS "video_assets_publication_idx" ON "video_assets" ("publication_id");
    CREATE INDEX IF NOT EXISTS "video_assets_space_idx" ON "video_assets" ("space_id");
    CREATE INDEX IF NOT EXISTS "video_assets_owner_idx" ON "video_assets" ("owner_id");
    ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "video_asset_id" uuid REFERENCES "video_assets"("id") ON DELETE SET NULL;
    CREATE TABLE IF NOT EXISTS "video_captions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "title" varchar NOT NULL,
      "video_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE CASCADE,
      "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
      "language" varchar NOT NULL, "label" varchar NOT NULL, "default" boolean DEFAULT false,
      "kind" varchar NOT NULL DEFAULT 'subtitles', "validation" jsonb NOT NULL,
      "transcript_id" uuid REFERENCES "transcript_revisions"("id") ON DELETE SET NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(), "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "video_captions_video_idx" ON "video_captions" ("video_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "video_assets_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_assets_fk" FOREIGN KEY ("video_assets_id") REFERENCES "video_assets"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_video_assets_id_idx" ON "payload_locked_documents_rels" ("video_assets_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "video_captions_id" uuid;
    DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_captions_fk" FOREIGN KEY ("video_captions_id") REFERENCES "video_captions"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_video_captions_id_idx" ON "payload_locked_documents_rels" ("video_captions_id");
    ALTER TABLE "videos_rels" ADD COLUMN IF NOT EXISTS "authors_id" uuid REFERENCES "authors"("id") ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS "videos_rels_authors_id_idx" ON "videos_rels" ("authors_id");
    ALTER TABLE "videos_rels" ADD COLUMN IF NOT EXISTS "video_captions_id" uuid REFERENCES "video_captions"("id") ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS "videos_rels_video_captions_id_idx" ON "videos_rels" ("video_captions_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "videos_rels" DROP COLUMN IF EXISTS "video_captions_id";
    ALTER TABLE "videos_rels" DROP COLUMN IF EXISTS "authors_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_video_captions_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_video_captions_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "video_captions_id";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_video_assets_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_video_assets_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "video_assets_id";
    ALTER TABLE "videos" DROP COLUMN IF EXISTS "video_asset_id";
    DROP TABLE IF EXISTS "video_captions" CASCADE;
    DROP TABLE IF EXISTS "video_assets" CASCADE;
    ALTER TABLE "videos" DROP COLUMN IF EXISTS "distribution_clips", DROP COLUMN IF EXISTS "poster_id", DROP COLUMN IF EXISTS "source_asset_id", DROP COLUMN IF EXISTS "rights", DROP COLUMN IF EXISTS "visibility", DROP COLUMN IF EXISTS "body";
    ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "video_metadata";
  `)},name:"20260914_110000_med_05_video_workflow"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "site_settings"
      ADD COLUMN IF NOT EXISTS "canonical_origins_by_site" jsonb,
      ADD COLUMN IF NOT EXISTS "discovery_defaults" jsonb,
      ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb,
      ADD COLUMN IF NOT EXISTS "launch_state" varchar NOT NULL DEFAULT 'live',
      ADD COLUMN IF NOT EXISTS "launched_at" timestamptz;
    ALTER TABLE IF EXISTS "content" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "events" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "timelines" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "podcast_shows" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "podcast_episodes" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "videos" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE IF EXISTS "videos" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "podcast_episodes" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "podcast_shows" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "timelines" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "events" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "content" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "launched_at", DROP COLUMN IF EXISTS "launch_state", DROP COLUMN IF EXISTS "discovery_overrides", DROP COLUMN IF EXISTS "discovery_defaults", DROP COLUMN IF EXISTS "canonical_origins_by_site";
  `)},name:"20260914_120000_disc_01_discovery_workflow"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE IF EXISTS "books" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "video_channels" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "video_playlists" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "interviews" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    ALTER TABLE IF EXISTS "livestreams" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE IF EXISTS "livestreams" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "interviews" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "video_playlists" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "video_channels" DROP COLUMN IF EXISTS "discovery_overrides";
    ALTER TABLE IF EXISTS "books" DROP COLUMN IF EXISTS "discovery_overrides";
  `)},name:"20260914_121000_disc_01_shared_seo_fields"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE TABLE IF NOT EXISTS search_documents (
      id bigserial PRIMARY KEY, site_id varchar NOT NULL, collection varchar NOT NULL, canonical_id varchar NOT NULL,
      canonical_revision_id varchar, canonical_url text NOT NULL, path text NOT NULL, content_type varchar NOT NULL,
      title text NOT NULL, excerpt text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', author text,
      taxonomy text NOT NULL DEFAULT '', published_at timestamptz, modified_at timestamptz, language varchar,
      media_hints jsonb NOT NULL DEFAULT '[]'::jsonb, visibility varchar NOT NULL DEFAULT 'public', index_version integer NOT NULL, indexed_at timestamptz NOT NULL DEFAULT now(),
      search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title,'')), 'A') || setweight(to_tsvector('simple', coalesce(excerpt,'')), 'B') || setweight(to_tsvector('simple', coalesce(taxonomy,'')), 'B') || setweight(to_tsvector('simple', coalesce(body,'')), 'C')) STORED,
      UNIQUE(collection, canonical_id)
    );
    CREATE INDEX IF NOT EXISTS search_documents_public_idx ON search_documents(site_id, content_type, published_at DESC) WHERE visibility = 'public';
    CREATE INDEX IF NOT EXISTS search_documents_vector_idx ON search_documents USING gin(search_vector);
    CREATE INDEX IF NOT EXISTS search_documents_title_trgm_idx ON search_documents USING gin(title gin_trgm_ops);
  `)},down:async function a({db:b}){await b.execute(aa.sql`DROP TABLE IF EXISTS search_documents;`)},name:"20260915_130000_disc_04_search_projection"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "article_family_content" ADD COLUMN IF NOT EXISTS "quality_gate_snapshot" jsonb;
    ALTER TABLE "article_family_content" ADD COLUMN IF NOT EXISTS "quality_waiver" jsonb;
    ALTER TABLE "article_family_content" ADD COLUMN IF NOT EXISTS "review_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "article_family_content" DROP COLUMN IF EXISTS "review_decisions";
    ALTER TABLE "article_family_content" DROP COLUMN IF EXISTS "quality_waiver";
    ALTER TABLE "article_family_content" DROP COLUMN IF EXISTS "quality_gate_snapshot";
  `)},name:"20260916_070000_editorial_quality_gate_snapshot"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "message_snapshot" jsonb;
    UPDATE "email_deliveries" d
      SET "message_snapshot" = jsonb_build_object(
        'subject', m."subject", 'blocks', m."blocks", 'kind', m."kind", 'reviewedAt', m."reviewed_at"
      )
      FROM "email_messages" m
      WHERE d."message_id" = m."id" AND d."message_snapshot" IS NULL;
  `)},down:async function a({db:b}){await b.execute(aa.sql`ALTER TABLE "email_deliveries" DROP COLUMN IF EXISTS "message_snapshot";`)},name:"20260920_000000_aud_00_delivery_snapshots"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone_e164" varchar;
    ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "erased_at" timestamp(3) with time zone;
    ALTER TABLE "subscriber_confirmation_tokens" ADD COLUMN IF NOT EXISTS "purpose" varchar DEFAULT 'confirmation', ADD COLUMN IF NOT EXISTS "revoked_at" timestamp(3) with time zone;
    ALTER TABLE "consent_events" ADD COLUMN IF NOT EXISTS "channel" varchar, ADD COLUMN IF NOT EXISTS "purpose" varchar, ADD COLUMN IF NOT EXISTS "policy_version" varchar, ADD COLUMN IF NOT EXISTS "capture_source" varchar, ADD COLUMN IF NOT EXISTS "proof_reference" varchar, ADD COLUMN IF NOT EXISTS "jurisdiction" varchar, ADD COLUMN IF NOT EXISTS "actor_id" integer, ADD COLUMN IF NOT EXISTS "ip_digest" varchar, ADD COLUMN IF NOT EXISTS "user_agent_digest" varchar;
    ALTER TABLE "preferences" ADD COLUMN IF NOT EXISTS "derived_at" timestamp(3) with time zone;
    ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "scope" varchar DEFAULT 'site', ADD COLUMN IF NOT EXISTS "source" varchar, ADD COLUMN IF NOT EXISTS "details" jsonb;
  `)},down:async function a({db:b}){await b.execute(aa.sql`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "phone_e164"; ALTER TABLE "subscribers" DROP COLUMN IF EXISTS "erased_at";`)},name:"20260920_010000_aud_01_audience_evidence"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "form_definitions" ADD COLUMN IF NOT EXISTS "title" varchar, ADD COLUMN IF NOT EXISTS "copy" varchar, ADD COLUMN IF NOT EXISTS "actions" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "action_state" jsonb DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "review_notes" jsonb DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "submitted_at" timestamp(3) with time zone;
    CREATE INDEX IF NOT EXISTS "form_submissions_submitted_at_idx" ON "form_submissions" ("submitted_at");
  `)},down:async function a({db:b}){await b.execute(aa.sql`ALTER TABLE "form_definitions" DROP COLUMN IF EXISTS "title", DROP COLUMN IF EXISTS "copy", DROP COLUMN IF EXISTS "actions"; ALTER TABLE "form_submissions" DROP COLUMN IF EXISTS "action_state", DROP COLUMN IF EXISTS "review_notes", DROP COLUMN IF EXISTS "submitted_at";`)},name:"20260920_020000_aud_02_forms"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "email_templates" ("id" serial PRIMARY KEY, "site_id" integer, "name" varchar NOT NULL, "version" varchar NOT NULL, "locale" varchar DEFAULT 'en', "brand_tokens" jsonb DEFAULT '{}'::jsonb, "registered_blocks" jsonb DEFAULT '[]'::jsonb, "layout_regions" jsonb DEFAULT '[]'::jsonb, "plain_text_strategy" varchar DEFAULT 'generated', "status" varchar DEFAULT 'draft', "created_at" timestamp(3) with time zone DEFAULT now(), "updated_at" timestamp(3) with time zone DEFAULT now());
    CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_site_name_version_idx" ON "email_templates" ("site_id", "name", "version");
    ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "preheader" varchar, ADD COLUMN IF NOT EXISTS "sender_identity" jsonb, ADD COLUMN IF NOT EXISTS "purpose" varchar DEFAULT 'newsletter', ADD COLUMN IF NOT EXISTS "channel" varchar DEFAULT 'email', ADD COLUMN IF NOT EXISTS "language" varchar DEFAULT 'en', ADD COLUMN IF NOT EXISTS "message_design" jsonb, ADD COLUMN IF NOT EXISTS "email_template_id" integer, ADD COLUMN IF NOT EXISTS "template_version" varchar, ADD COLUMN IF NOT EXISTS "variant_key" varchar DEFAULT 'control', ADD COLUMN IF NOT EXISTS "parent_message_id" integer, ADD COLUMN IF NOT EXISTS "approved_render" jsonb, ADD COLUMN IF NOT EXISTS "approval_invalidated_at" timestamp(3) with time zone;
  `)},down:async function a({db:b}){await b.execute(aa.sql`DROP TABLE IF EXISTS "email_templates";`)},name:"20260920_030000_aud_03_email_composer"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "email_deliveries"
      ADD COLUMN IF NOT EXISTS "accepted_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "lease_until" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "render_hash" varchar,
      ADD COLUMN IF NOT EXISTS "message_id" varchar,
      ADD COLUMN IF NOT EXISTS "unsubscribe_token" varchar;
    CREATE INDEX IF NOT EXISTS "email_deliveries_next_attempt_at_idx" ON "email_deliveries" ("next_attempt_at");
    CREATE INDEX IF NOT EXISTS "email_deliveries_lease_until_idx" ON "email_deliveries" ("lease_until");
    CREATE TABLE IF NOT EXISTS "email_delivery_events" (
      "id" serial PRIMARY KEY, "delivery_id" integer NOT NULL, "idempotency_key" varchar NOT NULL,
      "provider" varchar NOT NULL, "provider_event_id" varchar, "event" varchar NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL, "evidence" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now(), "updated_at" timestamp(3) with time zone DEFAULT now());
    CREATE UNIQUE INDEX IF NOT EXISTS "email_delivery_events_idempotency_key_idx" ON "email_delivery_events" ("idempotency_key");
  `)},down:async function a({db:b}){await b.execute(aa.sql`DROP TABLE IF EXISTS "email_delivery_events";`)},name:"20260920_050000_aud_05_email_delivery"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "telecom_messages" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "title" varchar NOT NULL,
      "body" text NOT NULL,
      "channel" varchar NOT NULL DEFAULT 'sms',
      "purpose" varchar DEFAULT 'marketing',
      "status" varchar NOT NULL DEFAULT 'draft',
      "from" varchar,
      "scheduled_for" timestamp(3) with time zone,
      "rcs_content" jsonb,
      "fallback_policy" varchar DEFAULT 'prohibit',
      "fallback_sms_body" text,
      "audience" jsonb,
      "estimated_cost" jsonb,
      "approved_at" timestamp(3) with time zone,
      "approved_render" jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "telecom_deliveries" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "message_id" integer NOT NULL,
      "subscriber_id" integer,
      "recipient_phone" varchar NOT NULL,
      "recipient_phone_hash" varchar NOT NULL,
      "channel" varchar NOT NULL DEFAULT 'sms',
      "idempotency_key" varchar NOT NULL,
      "status" varchar NOT NULL DEFAULT 'queued',
      "delivery_path" varchar,
      "provider" varchar,
      "provider_message_id" varchar,
      "attempts" integer DEFAULT 0,
      "segments" integer,
      "accepted_at" timestamp(3) with time zone,
      "scheduled_for" timestamp(3) with time zone,
      "quiet_hours_delayed_until" timestamp(3) with time zone,
      "message_snapshot" jsonb,
      "actual_cost" jsonb,
      "outcome" jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "telecom_deliveries_idempotency_key_idx" ON "telecom_deliveries" ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "telecom_deliveries_recipient_phone_hash_idx" ON "telecom_deliveries" ("recipient_phone_hash");
    CREATE INDEX IF NOT EXISTS "telecom_deliveries_status_idx" ON "telecom_deliveries" ("status");
    CREATE INDEX IF NOT EXISTS "telecom_deliveries_provider_message_id_idx" ON "telecom_deliveries" ("provider_message_id");

    CREATE TABLE IF NOT EXISTS "telecom_delivery_events" (
      "id" serial PRIMARY KEY,
      "delivery_id" integer NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "provider" varchar NOT NULL,
      "provider_event_id" varchar,
      "event" varchar NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "evidence" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "telecom_delivery_events_idempotency_key_idx" ON "telecom_delivery_events" ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "telecom_delivery_events_provider_event_id_idx" ON "telecom_delivery_events" ("provider_event_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "telecom_delivery_events";
    DROP TABLE IF EXISTS "telecom_deliveries";
    DROP TABLE IF EXISTS "telecom_messages";
  `)},name:"20260920_060000_aud_06_telecom"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "audience_experiments" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "title" varchar NOT NULL,
      "hypothesis" text NOT NULL,
      "channel" varchar NOT NULL DEFAULT 'email',
      "metric" varchar NOT NULL DEFAULT 'open_rate',
      "window_hours" integer DEFAULT 24,
      "status" varchar NOT NULL DEFAULT 'draft',
      "variants" jsonb NOT NULL,
      "guardrails" jsonb NOT NULL,
      "winner_decision" jsonb DEFAULT '{}'::jsonb,
      "allocations_hash" varchar,
      "total_allocated" integer DEFAULT 0,
      "started_at" timestamp(3) with time zone,
      "concluded_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "audience_experiments_site_id_idx" ON "audience_experiments" ("site_id");
    CREATE INDEX IF NOT EXISTS "audience_experiments_status_idx" ON "audience_experiments" ("status");

    CREATE TABLE IF NOT EXISTS "audience_attribution_events" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "campaign_id" varchar NOT NULL,
      "variant_id" varchar,
      "channel" varchar NOT NULL DEFAULT 'email',
      "event_type" varchar NOT NULL,
      "recipient_hash" varchar,
      "is_bot" boolean DEFAULT false,
      "bot_reason" varchar,
      "attribution_model" varchar DEFAULT 'last-non-direct',
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "audience_attribution_events_campaign_idx" ON "audience_attribution_events" ("campaign_id");
    CREATE INDEX IF NOT EXISTS "audience_attribution_events_occurred_idx" ON "audience_attribution_events" ("occurred_at");
    CREATE INDEX IF NOT EXISTS "audience_attribution_events_is_bot_idx" ON "audience_attribution_events" ("is_bot");

    CREATE TABLE IF NOT EXISTS "audience_command_snapshots" (
      "id" serial PRIMARY KEY,
      "site_id" integer,
      "snapshot_type" varchar NOT NULL,
      "window_key" varchar NOT NULL,
      "payload" jsonb NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "audience_command_snapshots_lookup_idx" ON "audience_command_snapshots" ("site_id", "snapshot_type", "window_key");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "audience_command_snapshots";
    DROP TABLE IF EXISTS "audience_attribution_events";
    DROP TABLE IF EXISTS "audience_experiments";
  `)},name:"20260920_070000_aud_07_audience_command"},{up:async function a({db:b}){await b.execute(aa.sql`
    -- 1. Ensure all audience collections have lock relations in payload_locked_documents_rels
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "email_templates_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_email_templates_id_idx" ON "payload_locked_documents_rels" ("email_templates_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "email_delivery_events_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_email_delivery_events_id_idx" ON "payload_locked_documents_rels" ("email_delivery_events_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "telecom_messages_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_telecom_messages_id_idx" ON "payload_locked_documents_rels" ("telecom_messages_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "telecom_deliveries_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_telecom_deliveries_id_idx" ON "payload_locked_documents_rels" ("telecom_deliveries_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "telecom_delivery_events_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_telecom_delivery_events_id_idx" ON "payload_locked_documents_rels" ("telecom_delivery_events_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "automation_runs_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_automation_runs_id_idx" ON "payload_locked_documents_rels" ("automation_runs_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "automation_failures_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_automation_failures_id_idx" ON "payload_locked_documents_rels" ("automation_failures_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "recipient_snapshots_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_recipient_snapshots_id_idx" ON "payload_locked_documents_rels" ("recipient_snapshots_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "audience_frequency_policies_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_audience_frequency_policies_id_idx" ON "payload_locked_documents_rels" ("audience_frequency_policies_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "audience_experiments_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_audience_experiments_id_idx" ON "payload_locked_documents_rels" ("audience_experiments_id");

    -- 2. Ensure missing schema columns on existing audience tables are added
    ALTER TABLE "audience_lists" ADD COLUMN IF NOT EXISTS "provenance" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "audience_segments" ADD COLUMN IF NOT EXISTS "version" varchar DEFAULT '1.0.0';
    ALTER TABLE "audience_segments" ADD COLUMN IF NOT EXISTS "last_evaluation" jsonb;
    ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "recipient_snapshot_id" uuid;
    ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "priority" numeric DEFAULT 100;
    ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "recipient_snapshot_hash" varchar;
    ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "rfc_message_id" varchar;
    ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "message_id" uuid;
    ALTER TYPE "enum_email_deliveries_status" ADD VALUE IF NOT EXISTS 'accepted';
    ALTER TYPE "enum_email_deliveries_status" ADD VALUE IF NOT EXISTS 'deferred';
    ALTER TYPE "enum_email_deliveries_status" ADD VALUE IF NOT EXISTS 'unknown';
    ALTER TYPE "enum_email_deliveries_status" ADD VALUE IF NOT EXISTS 'dead-letter';
    ALTER TYPE "enum_automation_definitions_status" ADD VALUE IF NOT EXISTS 'review';
    ALTER TYPE "enum_automation_definitions_status" ADD VALUE IF NOT EXISTS 'cancelled';
    ALTER TYPE "enum_consent_events_event" ADD VALUE IF NOT EXISTS 'preference-granted';
    ALTER TYPE "enum_consent_events_event" ADD VALUE IF NOT EXISTS 'preference-withdrawn';
    ALTER TYPE "enum_consent_events_event" ADD VALUE IF NOT EXISTS 'operator-correction';
    ALTER TYPE "enum_consent_events_event" ADD VALUE IF NOT EXISTS 'erased';
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "version" varchar DEFAULT '1.0.0';
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "reentry_policy" varchar DEFAULT 'never';
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "quiet_hours" jsonb;
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "approved_at" timestamp(3) with time zone;
    ALTER TABLE "automation_definitions" ADD COLUMN IF NOT EXISTS "pinned" jsonb;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_delivery_events' AND column_name = 'delivery_id' AND data_type = 'integer'
      ) THEN
        DROP TABLE IF EXISTS "email_delivery_events" CASCADE;
        CREATE TABLE "email_delivery_events" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "delivery_id" uuid NOT NULL REFERENCES "email_deliveries"("id") ON DELETE CASCADE,
          "idempotency_key" varchar NOT NULL UNIQUE,
          "provider" varchar NOT NULL,
          "provider_event_id" varchar,
          "event" varchar NOT NULL,
          "occurred_at" timestamp(3) with time zone NOT NULL,
          "evidence" jsonb DEFAULT '{}'::jsonb,
          "created_at" timestamp(3) with time zone DEFAULT now(),
          "updated_at" timestamp(3) with time zone DEFAULT now()
        );
      END IF;
    END $$;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'telecom_messages' AND column_name = 'site_id' AND data_type = 'integer'
      ) THEN
        DROP TABLE IF EXISTS "telecom_delivery_events" CASCADE;
        DROP TABLE IF EXISTS "telecom_deliveries" CASCADE;
        DROP TABLE IF EXISTS "telecom_messages" CASCADE;

        CREATE TABLE "telecom_messages" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
          "publication_id" uuid,
          "space_id" uuid,
          "owner_id" uuid,
          "title" varchar NOT NULL,
          "body" text NOT NULL,
          "channel" varchar NOT NULL DEFAULT 'sms',
          "purpose" varchar DEFAULT 'marketing',
          "status" varchar NOT NULL DEFAULT 'draft',
          "from" varchar,
          "scheduled_for" timestamp(3) with time zone,
          "rcs_content" jsonb,
          "fallback_policy" varchar DEFAULT 'prohibit',
          "fallback_sms_body" text,
          "audience" jsonb,
          "estimated_cost" jsonb,
          "approved_at" timestamp(3) with time zone,
          "approved_render" jsonb,
          "created_at" timestamp(3) with time zone DEFAULT now(),
          "updated_at" timestamp(3) with time zone DEFAULT now()
        );

        CREATE TABLE "telecom_deliveries" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
          "publication_id" uuid,
          "space_id" uuid,
          "owner_id" uuid,
          "message_id" uuid NOT NULL REFERENCES "telecom_messages"("id") ON DELETE CASCADE,
          "subscriber_id" uuid,
          "recipient_phone" varchar NOT NULL,
          "recipient_phone_hash" varchar NOT NULL,
          "channel" varchar NOT NULL DEFAULT 'sms',
          "idempotency_key" varchar NOT NULL UNIQUE,
          "status" varchar NOT NULL DEFAULT 'queued',
          "delivery_path" varchar,
          "provider" varchar,
          "provider_message_id" varchar,
          "attempts" integer DEFAULT 0,
          "segments" integer,
          "accepted_at" timestamp(3) with time zone,
          "scheduled_for" timestamp(3) with time zone,
          "quiet_hours_delayed_until" timestamp(3) with time zone,
          "message_snapshot" jsonb,
          "actual_cost" jsonb,
          "outcome" jsonb,
          "created_at" timestamp(3) with time zone DEFAULT now(),
          "updated_at" timestamp(3) with time zone DEFAULT now()
        );

        CREATE TABLE "telecom_delivery_events" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "delivery_id" uuid NOT NULL REFERENCES "telecom_deliveries"("id") ON DELETE CASCADE,
          "idempotency_key" varchar NOT NULL UNIQUE,
          "provider" varchar NOT NULL,
          "provider_event_id" varchar,
          "event" varchar NOT NULL,
          "occurred_at" timestamp(3) with time zone NOT NULL,
          "evidence" jsonb DEFAULT '{}'::jsonb,
          "created_at" timestamp(3) with time zone DEFAULT now(),
          "updated_at" timestamp(3) with time zone DEFAULT now()
        );
      END IF;
    END $$;

    -- 3. Ensure durable automation and recipient tables exist
    CREATE TABLE IF NOT EXISTS "automation_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid,
      "definition_id" uuid,
      "source_event_id" uuid,
      "idempotency_key" varchar NOT NULL UNIQUE,
      "status" varchar NOT NULL DEFAULT 'queued',
      "subject" jsonb NOT NULL,
      "definition_version" varchar NOT NULL,
      "step" integer DEFAULT 0,
      "next_run_at" timestamp(3) with time zone,
      "outcome" jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "automation_failures" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid,
      "action_index" integer NOT NULL,
      "error" jsonb NOT NULL,
      "retryable" boolean DEFAULT true,
      "resolved_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "recipient_snapshots" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid,
      "publication_id" uuid,
      "space_id" uuid,
      "owner_id" uuid,
      "message_id" uuid,
      "segment_id" uuid,
      "segment_version" varchar NOT NULL,
      "evaluated_at" timestamp(3) with time zone NOT NULL,
      "recipients" jsonb NOT NULL,
      "exclusion_counts" jsonb NOT NULL,
      "hash" varchar NOT NULL UNIQUE,
      "approval_audit" jsonb NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "audience_frequency_policies" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid,
      "publication_id" uuid,
      "space_id" uuid,
      "owner_id" uuid,
      "purpose" varchar NOT NULL,
      "channel" varchar DEFAULT 'email',
      "max_sends" integer NOT NULL DEFAULT 4,
      "window_hours" integer NOT NULL DEFAULT 168,
      "global_fatigue" boolean DEFAULT false,
      "created_at" timestamp(3) with time zone DEFAULT now(),
      "updated_at" timestamp(3) with time zone DEFAULT now()
    );

    ALTER TABLE "recipient_snapshots" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
    ALTER TABLE "recipient_snapshots" ADD COLUMN IF NOT EXISTS "space_id" uuid;
    ALTER TABLE "recipient_snapshots" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
    ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
    ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "space_id" uuid;
    ALTER TABLE "automation_runs" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
    ALTER TABLE "automation_failures" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
    ALTER TABLE "automation_failures" ADD COLUMN IF NOT EXISTS "space_id" uuid;
    ALTER TABLE "automation_failures" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
    ALTER TABLE "audience_frequency_policies" ADD COLUMN IF NOT EXISTS "publication_id" uuid;
    ALTER TABLE "audience_frequency_policies" ADD COLUMN IF NOT EXISTS "space_id" uuid;
    ALTER TABLE "audience_frequency_policies" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "email_templates_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "email_delivery_events_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "telecom_messages_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "telecom_deliveries_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "telecom_delivery_events_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "automation_runs_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "automation_failures_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "recipient_snapshots_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "audience_frequency_policies_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "audience_experiments_id";
  `)},name:"20260920_080000_aud_08_audience_pass_gate"},{up:async function a({db:b}){await b.execute(aa.sql`
    -- 1. Community Reactions table
    CREATE TABLE IF NOT EXISTS "community_reactions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "member_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      "target_type" varchar(32) NOT NULL,
      "target_id" varchar(255) NOT NULL,
      "emoji" varchar(64) NOT NULL,
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_community_reactions_unique" 
      ON "community_reactions" ("site_id", "member_id", "target_type", "target_id", "emoji");
    CREATE INDEX IF NOT EXISTS "idx_community_reactions_target" 
      ON "community_reactions" ("target_type", "target_id");

    -- 2. Community Reports table
    CREATE TABLE IF NOT EXISTS "community_reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "reporter_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      "target_type" varchar(32) NOT NULL,
      "target_id" varchar(255) NOT NULL,
      "reason" varchar(255) NOT NULL,
      "details" text,
      "status" varchar(32) DEFAULT 'pending' NOT NULL,
      "resolution" text,
      "resolved_by" varchar(255),
      "resolved_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_community_reports_site_status" 
      ON "community_reports" ("site_id", "status");
    CREATE INDEX IF NOT EXISTS "idx_community_reports_target" 
      ON "community_reports" ("target_type", "target_id");

    -- 3. Community Moderation Actions audit table
    CREATE TABLE IF NOT EXISTS "moderation_actions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "actor" varchar(255) NOT NULL,
      "target_type" varchar(32) NOT NULL,
      "target_id" varchar(255) NOT NULL,
      "action" varchar(32) NOT NULL,
      "reason" text NOT NULL,
      "details" jsonb DEFAULT '{}'::jsonb,
      "occurred_at" timestamp with time zone DEFAULT now(),
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_moderation_actions_target" 
      ON "moderation_actions" ("target_type", "target_id");

    -- 4. Community Conversations table
    CREATE TABLE IF NOT EXISTS "community_conversations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "title" varchar(255),
      "status" varchar(32) DEFAULT 'active' NOT NULL,
      "last_message_at" timestamp with time zone DEFAULT now(),
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_community_conversations_site" 
      ON "community_conversations" ("site_id", "last_message_at");

    -- 5. Community Conversation Participants table
    CREATE TABLE IF NOT EXISTS "community_conversation_participants" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid REFERENCES "community_conversations"("id") ON DELETE CASCADE,
      "member_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      "joined_at" timestamp with time zone DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_community_conv_participants_unique" 
      ON "community_conversation_participants" ("conversation_id", "member_id");
    CREATE INDEX IF NOT EXISTS "idx_community_conv_participants_member" 
      ON "community_conversation_participants" ("member_id");

    -- 6. Community Messages table
    CREATE TABLE IF NOT EXISTS "community_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid REFERENCES "community_conversations"("id") ON DELETE CASCADE,
      "sender_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      "body" text NOT NULL,
      "attachments" jsonb DEFAULT '[]'::jsonb,
      "read_by" jsonb DEFAULT '[]'::jsonb,
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_community_messages_conversation" 
      ON "community_messages" ("conversation_id", "created_at");

    -- 7. Ensure team_memberships default id is gen_random_uuid()
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_memberships') THEN
        ALTER TABLE "team_memberships" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
      END IF;
    END $$;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "community_messages";
    DROP TABLE IF EXISTS "community_conversation_participants";
    DROP TABLE IF EXISTS "community_conversations";
    DROP TABLE IF EXISTS "moderation_actions";
    DROP TABLE IF EXISTS "community_reports";
    DROP TABLE IF EXISTS "community_reactions";
  `)},name:"20260920_090000_comm_00_community_domain"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'restricted';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'suspended';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'deactivated';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'deletion-pending';
    ALTER TYPE "public"."enum_members_status" ADD VALUE IF NOT EXISTS 'deleted';
    ALTER TYPE "public"."enum_identity_tokens_purpose" ADD VALUE IF NOT EXISTS 'passkey-registration';
    ALTER TYPE "public"."enum_identity_tokens_purpose" ADD VALUE IF NOT EXISTS 'passkey-authentication';

    -- PostgreSQL cannot use an enum value added by ALTER TYPE until this
    -- migration transaction commits. COMM-02 applies the new default next.
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "restricted_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deletion_pending_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "state_reason" text;

    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "handle_changed_at" timestamp(3) with time zone;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "handle_history" jsonb;

    ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "community_registration_policy" varchar DEFAULT 'open' NOT NULL;

    DO $$
    BEGIN
      CREATE TYPE "public"."enum_member_site_roles_role" AS ENUM ('member', 'trusted', 'contributor', 'moderator', 'community-manager');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `),await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "member_site_roles" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "public"."members"("id") ON DELETE CASCADE,
      "role" "enum_member_site_roles_role" DEFAULT 'member' NOT NULL,
      "granted_by_user_id" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "member_site_roles_site_idx" ON "member_site_roles" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "member_site_roles_member_idx" ON "member_site_roles" USING btree ("member_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "member_site_roles_site_member_idx" ON "member_site_roles" USING btree ("site_id", "member_id");

    -- Payload's document-lock relation is a polymorphic table with one column
    -- per registered collection. Registering a collection without this column
    -- breaks every locked-document lookup, including unrelated publication
    -- writes. Keep it additive for upgrades as well as fresh installs.
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "member_site_roles_id" uuid;
    DO $$
    BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_member_site_roles_fk"
        FOREIGN KEY ("member_site_roles_id") REFERENCES "public"."member_site_roles"("id")
        ON DELETE CASCADE ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_member_site_roles_id_idx"
      ON "payload_locked_documents_rels" USING btree ("member_site_roles_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_member_site_roles_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_member_site_roles_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "member_site_roles_id";
    DROP TABLE IF EXISTS "member_site_roles";
    DROP TYPE IF EXISTS "public"."enum_member_site_roles_role";
    ALTER TABLE "members" ALTER COLUMN "status" SET DEFAULT 'active';
    ALTER TABLE "sites" DROP COLUMN IF EXISTS "community_registration_policy";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "handle_history", DROP COLUMN IF EXISTS "handle_changed_at";
    ALTER TABLE "members"
      DROP COLUMN IF EXISTS "state_reason",
      DROP COLUMN IF EXISTS "deleted_at",
      DROP COLUMN IF EXISTS "deletion_pending_at",
      DROP COLUMN IF EXISTS "deactivated_at",
      DROP COLUMN IF EXISTS "suspended_at",
      DROP COLUMN IF EXISTS "restricted_at";
  `)},name:"20260920_100000_comm_01_member_auth_lifecycle"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "members" ALTER COLUMN "status" SET DEFAULT 'pending';
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_alt" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cover_alt" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "locale" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "time_zone" varchar;
    ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "discovery_opt_out" boolean DEFAULT false;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "members" ALTER COLUMN "status" SET DEFAULT 'active';
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "discovery_opt_out";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "time_zone";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "locale";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "cover_alt";
    ALTER TABLE "profiles" DROP COLUMN IF EXISTS "avatar_alt";
  `)},name:"20260921_000000_comm_02_profile_projection"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "media_usages_rels" ADD COLUMN IF NOT EXISTS "profiles_id" uuid;
    DO $$
    BEGIN
      ALTER TABLE "media_usages_rels"
        ADD CONSTRAINT "media_usages_rels_profiles_fk"
        FOREIGN KEY ("profiles_id") REFERENCES "profiles"("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS "media_usages_rels_profiles_id_idx"
      ON "media_usages_rels" USING btree ("profiles_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "media_usages_rels" DROP CONSTRAINT IF EXISTS "media_usages_rels_profiles_fk";
    DROP INDEX IF EXISTS "media_usages_rels_profiles_id_idx";
    ALTER TABLE "media_usages_rels" DROP COLUMN IF EXISTS "profiles_id";
  `)},name:"20260921_010000_comm_02_profile_media_usage_relation"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    -- PostgreSQL has no built-in UUIDv7 generator on all supported versions.
    -- Keep generation local and time-sortable instead of silently using UUIDv4.
    CREATE OR REPLACE FUNCTION "renegade_uuid_v7"() RETURNS uuid
    LANGUAGE sql VOLATILE AS $$
      WITH parts AS (
        SELECT
          lpad(to_hex(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint), 12, '0') AS ts,
          encode(gen_random_bytes(10), 'hex') AS random_hex
      )
      SELECT (
        substr(ts, 1, 8) || '-' || substr(ts, 9, 4) ||
        '-7' || substr(random_hex, 1, 3) ||
        '-8' || substr(random_hex, 4, 3) ||
        '-' || substr(random_hex, 7, 12)
      )::uuid
      FROM parts;
    $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_comments_author_type" AS ENUM ('member', 'anonymous', 'system');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_comments_status" AS ENUM ('visible', 'pending_review', 'rejected', 'deleted');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "comment_threads" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "canonical_content_id" uuid NOT NULL REFERENCES "content"("id") ON DELETE CASCADE,
      "content_type" varchar(128) NOT NULL,
      "is_closed" boolean NOT NULL DEFAULT false,
      "is_frozen" boolean NOT NULL DEFAULT false,
      "premoderation_enabled" boolean NOT NULL DEFAULT false,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "comment_threads_site_content_unique" UNIQUE ("site_id", "canonical_content_id")
    );
    CREATE INDEX IF NOT EXISTS "comment_threads_content_idx" ON "comment_threads" ("canonical_content_id");

    CREATE TABLE IF NOT EXISTS "comments" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "thread_id" uuid NOT NULL REFERENCES "comment_threads"("id") ON DELETE CASCADE,
      "parent_id" uuid REFERENCES "comments"("id") ON DELETE RESTRICT,
      "root_id" uuid REFERENCES "comments"("id") ON DELETE RESTRICT,
      "author_id" uuid NOT NULL,
      "author_type" "enum_comments_author_type" NOT NULL,
      "status" "enum_comments_status" NOT NULL DEFAULT 'visible',
      "depth" integer NOT NULL DEFAULT 0 CHECK ("depth" >= 0 AND "depth" <= 5),
      "body_raw" text NOT NULL,
      "body_html" text NOT NULL,
      "client_mutation_id" uuid,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "deleted_at" timestamp(3) with time zone,
      CONSTRAINT "comments_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
    );
    CREATE INDEX IF NOT EXISTS "comments_thread_created_idx" ON "comments" ("thread_id", "created_at");
    CREATE INDEX IF NOT EXISTS "comments_parent_idx" ON "comments" ("parent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "comments_client_mutation_unique"
      ON "comments" ("thread_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "comment_revisions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "comment_id" uuid NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
      "editor_id" uuid NOT NULL,
      "previous_body_raw" text NOT NULL,
      "reason" text,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "comment_revisions_comment_created_idx"
      ON "comment_revisions" ("comment_id", "created_at");

    -- A foreign key cannot express that the content belongs to the same site.
    CREATE OR REPLACE FUNCTION "validate_comment_thread_content"() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "content" c
        WHERE c."id" = NEW."canonical_content_id" AND c."site_id" = NEW."site_id"
      ) THEN
        RAISE EXCEPTION 'canonical content % does not belong to site %', NEW."canonical_content_id", NEW."site_id"
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS "comment_threads_content_scope" ON "comment_threads";
    CREATE TRIGGER "comment_threads_content_scope"
      BEFORE INSERT OR UPDATE OF "site_id", "canonical_content_id" ON "comment_threads"
      FOR EACH ROW EXECUTE FUNCTION "validate_comment_thread_content"();
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "comment_revisions";
    DROP TABLE IF EXISTS "comments";
    DROP TABLE IF EXISTS "comment_threads";
    DROP FUNCTION IF EXISTS "validate_comment_thread_content"();
    DROP TYPE IF EXISTS "public"."enum_comments_status";
    DROP TYPE IF EXISTS "public"."enum_comments_author_type";
    DROP FUNCTION IF EXISTS "renegade_uuid_v7"();
  `)},name:"20260921_020000_comm_03a_comment_identity"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "comment_reaction_codes" jsonb NOT NULL
      DEFAULT '["thumbs_up", "heart", "insightful", "applause"]'::jsonb;

    CREATE TABLE IF NOT EXISTS "comment_reactions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "comment_id" uuid NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "reaction_code" varchar(64) NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "comment_reactions_unique" UNIQUE ("comment_id", "member_id", "reaction_code")
    );
    CREATE INDEX IF NOT EXISTS "comment_reactions_comment_code_idx"
      ON "comment_reactions" ("comment_id", "reaction_code");

    -- This table is deliberately a projection. comment_reactions remains authoritative.
    CREATE TABLE IF NOT EXISTS "comment_reaction_counters" (
      "comment_id" uuid NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
      "reaction_code" varchar(64) NOT NULL,
      "reaction_count" integer NOT NULL DEFAULT 0 CHECK ("reaction_count" >= 0),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("comment_id", "reaction_code")
    );
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "comment_reaction_counters";
    DROP TABLE IF EXISTS "comment_reactions";
    ALTER TABLE "sites" DROP COLUMN IF EXISTS "comment_reaction_codes";
  `)},name:"20260921_030000_comm_03c_comment_reactions"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "comment_thread_subscriptions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "thread_id" uuid NOT NULL REFERENCES "comment_threads"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "comment_thread_subscriptions_thread_member_unique" UNIQUE ("thread_id", "member_id")
    );
    CREATE INDEX IF NOT EXISTS "comment_thread_subscriptions_member_idx"
      ON "comment_thread_subscriptions" ("member_id");
    CREATE INDEX IF NOT EXISTS "comment_thread_subscriptions_thread_idx"
      ON "comment_thread_subscriptions" ("thread_id");

    CREATE TABLE IF NOT EXISTS "outbox_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "event_type" varchar(128) NOT NULL,
      "payload" jsonb NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "outbox_events_event_type_created_at_idx"
      ON "outbox_events" ("event_type", "created_at");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "outbox_events";
    DROP TABLE IF EXISTS "comment_thread_subscriptions";
  `)},name:"20260921_040000_comm_03d_thread_lifecycle_and_outbox"},{up:async function a({db:b}){await b.execute(aa.sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_forum_spaces_visibility" AS ENUM
        ('public', 'member_only', 'private', 'hidden');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_forum_spaces_join_policy" AS ENUM
        ('open', 'request_approval', 'invite_only');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_space_memberships_role" AS ENUM
        ('viewer', 'contributor', 'moderator', 'administrator');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_space_memberships_status" AS ENUM
        ('active', 'pending', 'invited');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "forum_spaces" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "parent_id" uuid REFERENCES "forum_spaces"("id") ON DELETE RESTRICT,
      "name" varchar(256) NOT NULL,
      "slug" varchar(160) NOT NULL,
      "description" text,
      "visibility" "enum_forum_spaces_visibility" NOT NULL DEFAULT 'public',
      "join_policy" "enum_forum_spaces_join_policy" NOT NULL DEFAULT 'open',
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "forum_spaces_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
      CONSTRAINT "forum_spaces_site_slug_unique" UNIQUE ("site_id", "slug")
    );
    CREATE INDEX IF NOT EXISTS "forum_spaces_site_parent_idx" ON "forum_spaces" ("site_id", "parent_id");

    -- The hierarchy is deliberately shallow: a root may have children, but no grandchildren.
    CREATE OR REPLACE FUNCTION "validate_forum_space_parent"() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."parent_id" IS NULL THEN
        RETURN NEW;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "forum_spaces" parent
        WHERE parent."id" = NEW."parent_id"
          AND parent."site_id" = NEW."site_id"
          AND parent."parent_id" IS NULL
      ) THEN
        RAISE EXCEPTION 'forum space parent must be a root in the same site'
          USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM "forum_spaces" child WHERE child."parent_id" = NEW."id") THEN
        RAISE EXCEPTION 'forum spaces support only one parent level'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS "forum_spaces_parent_scope" ON "forum_spaces";
    CREATE TRIGGER "forum_spaces_parent_scope"
      BEFORE INSERT OR UPDATE OF "site_id", "parent_id" ON "forum_spaces"
      FOR EACH ROW EXECUTE FUNCTION "validate_forum_space_parent"();

    CREATE TABLE IF NOT EXISTS "space_memberships" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "space_id" uuid NOT NULL REFERENCES "forum_spaces"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "role" "enum_space_memberships_role" NOT NULL DEFAULT 'viewer',
      "status" "enum_space_memberships_status" NOT NULL DEFAULT 'active',
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "space_memberships_space_member_unique" UNIQUE ("space_id", "member_id")
    );
    CREATE INDEX IF NOT EXISTS "space_memberships_member_idx" ON "space_memberships" ("member_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "space_memberships";
    DROP TRIGGER IF EXISTS "forum_spaces_parent_scope" ON "forum_spaces";
    DROP TABLE IF EXISTS "forum_spaces";
    DROP FUNCTION IF EXISTS "validate_forum_space_parent"();
    DROP TYPE IF EXISTS "public"."enum_space_memberships_status";
    DROP TYPE IF EXISTS "public"."enum_space_memberships_role";
    DROP TYPE IF EXISTS "public"."enum_forum_spaces_join_policy";
    DROP TYPE IF EXISTS "public"."enum_forum_spaces_visibility";
  `)},name:"20260921_050000_comm_04a_forum_spaces"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "forum_topics" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid NOT NULL REFERENCES "forum_spaces"("id") ON DELETE CASCADE,
      "author_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "title" varchar(256) NOT NULL,
      "is_locked" boolean NOT NULL DEFAULT false,
      "next_post_sequence" integer NOT NULL DEFAULT 1 CHECK ("next_post_sequence" >= 1),
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "forum_topics_space_updated_idx" ON "forum_topics" ("space_id", "updated_at" DESC);

    CREATE TABLE IF NOT EXISTS "forum_posts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "topic_id" uuid NOT NULL REFERENCES "forum_topics"("id") ON DELETE CASCADE,
      "author_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "sequence_number" integer NOT NULL CHECK ("sequence_number" >= 1),
      "reply_to_post_id" uuid REFERENCES "forum_posts"("id") ON DELETE RESTRICT,
      "body_raw" text NOT NULL,
      "body_html" text NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "forum_posts_topic_sequence_unique" UNIQUE ("topic_id", "sequence_number"),
      CONSTRAINT "forum_posts_reply_not_self" CHECK ("reply_to_post_id" IS NULL OR "reply_to_post_id" <> "id")
    );
    CREATE INDEX IF NOT EXISTS "forum_posts_topic_sequence_idx" ON "forum_posts" ("topic_id", "sequence_number");
    CREATE INDEX IF NOT EXISTS "forum_posts_reply_to_idx" ON "forum_posts" ("reply_to_post_id");

    CREATE TABLE IF NOT EXISTS "forum_drafts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid NOT NULL REFERENCES "forum_spaces"("id") ON DELETE CASCADE,
      "topic_id" uuid REFERENCES "forum_topics"("id") ON DELETE CASCADE,
      "author_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "title" varchar(256),
      "body_raw" text NOT NULL DEFAULT '',
      "reply_to_post_id" uuid REFERENCES "forum_posts"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "forum_drafts_author_target_unique" UNIQUE NULLS NOT DISTINCT ("author_id", "topic_id", "space_id")
    );

    CREATE OR REPLACE FUNCTION "validate_forum_topic_space_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM forum_spaces WHERE id = NEW.space_id AND site_id = NEW.site_id) THEN
        RAISE EXCEPTION 'forum topic space must belong to its site' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION "validate_forum_post_reply"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.reply_to_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM forum_posts WHERE id = NEW.reply_to_post_id AND topic_id = NEW.topic_id
      ) THEN RAISE EXCEPTION 'quoted post must belong to the same topic' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION "forum_post_immutable_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.author_id <> OLD.author_id OR NEW.created_at <> OLD.created_at
         OR NEW.topic_id <> OLD.topic_id OR NEW.sequence_number <> OLD.sequence_number
         OR NEW.reply_to_post_id IS DISTINCT FROM OLD.reply_to_post_id THEN
        RAISE EXCEPTION 'forum post identity and quote reference are immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$;
    DROP TRIGGER IF EXISTS "forum_topics_space_scope" ON "forum_topics";
    CREATE TRIGGER "forum_topics_space_scope" BEFORE INSERT OR UPDATE OF site_id, space_id ON "forum_topics"
      FOR EACH ROW EXECUTE FUNCTION "validate_forum_topic_space_scope"();
    DROP TRIGGER IF EXISTS "forum_posts_reply_scope" ON "forum_posts";
    CREATE TRIGGER "forum_posts_reply_scope" BEFORE INSERT OR UPDATE OF topic_id, reply_to_post_id ON "forum_posts"
      FOR EACH ROW EXECUTE FUNCTION "validate_forum_post_reply"();
    DROP TRIGGER IF EXISTS "forum_posts_immutable_identity" ON "forum_posts";
    CREATE TRIGGER "forum_posts_immutable_identity" BEFORE UPDATE ON "forum_posts"
      FOR EACH ROW EXECUTE FUNCTION "forum_post_immutable_identity"();
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "forum_drafts";
    DROP TRIGGER IF EXISTS "forum_posts_immutable_identity" ON "forum_posts";
    DROP TRIGGER IF EXISTS "forum_posts_reply_scope" ON "forum_posts";
    DROP TABLE IF EXISTS "forum_posts";
    DROP TRIGGER IF EXISTS "forum_topics_space_scope" ON "forum_topics";
    DROP TABLE IF EXISTS "forum_topics";
    DROP FUNCTION IF EXISTS "forum_post_immutable_identity"();
    DROP FUNCTION IF EXISTS "validate_forum_post_reply"();
    DROP FUNCTION IF EXISTS "validate_forum_topic_space_scope"();
  `)},name:"20260922_000000_comm_04b_forum_topics_posts"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "forum_topics"
      ADD COLUMN IF NOT EXISTS "view_count" integer NOT NULL DEFAULT 0 CHECK ("view_count" >= 0),
      ADD COLUMN IF NOT EXISTS "reply_count" integer NOT NULL DEFAULT 0 CHECK ("reply_count" >= 0),
      ADD COLUMN IF NOT EXISTS "last_post_author_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "last_post_timestamp" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "last_post_sequence_number" integer NOT NULL DEFAULT 0 CHECK ("last_post_sequence_number" >= 0);

    WITH latest_post AS (
      SELECT DISTINCT ON (fp.topic_id)
        fp.topic_id, fp.author_id, fp.created_at, fp.sequence_number,
        COUNT(*) OVER (PARTITION BY fp.topic_id)::integer AS count
      FROM "forum_posts" fp
      ORDER BY fp.topic_id, fp.sequence_number DESC
    )
    UPDATE "forum_topics" t SET
      "reply_count" = GREATEST(COALESCE(p.count, 0) - 1, 0),
      "last_post_author_id" = p.author_id,
      "last_post_timestamp" = p.created_at,
      "last_post_sequence_number" = COALESCE(p.sequence_number, 0)
    FROM latest_post p
    WHERE p.topic_id = t.id;

    CREATE TABLE IF NOT EXISTS "member_topic_read_state" (
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "topic_id" uuid NOT NULL REFERENCES "forum_topics"("id") ON DELETE CASCADE,
      "last_read_sequence_number" integer NOT NULL DEFAULT 0 CHECK ("last_read_sequence_number" >= 0),
      "read_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("member_id", "topic_id")
    );
    CREATE INDEX IF NOT EXISTS "member_topic_read_state_member_topic_idx"
      ON "member_topic_read_state" ("member_id", "topic_id", "last_read_sequence_number");
    CREATE INDEX IF NOT EXISTS "forum_topics_space_last_activity_idx"
      ON "forum_topics" ("space_id", "last_post_timestamp" DESC, "id" DESC);
    CREATE INDEX IF NOT EXISTS "forum_topics_space_creation_idx"
      ON "forum_topics" ("space_id", "created_at" DESC, "id" DESC);
    CREATE INDEX IF NOT EXISTS "forum_topics_space_reply_count_idx"
      ON "forum_topics" ("space_id", "reply_count" DESC, "id" DESC);

    CREATE OR REPLACE FUNCTION "project_forum_topic_summary"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE "forum_topics" SET
        "reply_count" = GREATEST("next_post_sequence" - 2, 0),
        "last_post_author_id" = NEW.author_id,
        "last_post_timestamp" = NEW.created_at,
        "last_post_sequence_number" = NEW.sequence_number,
        "updated_at" = now()
      WHERE id = NEW.topic_id AND "last_post_sequence_number" < NEW.sequence_number;
      RETURN NEW;
    END; $$;
    DROP TRIGGER IF EXISTS "forum_posts_summary_projection" ON "forum_posts";
    CREATE TRIGGER "forum_posts_summary_projection" AFTER INSERT ON "forum_posts"
      FOR EACH ROW EXECUTE FUNCTION "project_forum_topic_summary"();
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TRIGGER IF EXISTS "forum_posts_summary_projection" ON "forum_posts";
    DROP FUNCTION IF EXISTS "project_forum_topic_summary"();
    DROP TABLE IF EXISTS "member_topic_read_state";
    DROP INDEX IF EXISTS "forum_topics_space_reply_count_idx";
    DROP INDEX IF EXISTS "forum_topics_space_creation_idx";
    DROP INDEX IF EXISTS "forum_topics_space_last_activity_idx";
    ALTER TABLE "forum_topics"
      DROP COLUMN IF EXISTS "last_post_sequence_number",
      DROP COLUMN IF EXISTS "last_post_timestamp",
      DROP COLUMN IF EXISTS "last_post_author_id",
      DROP COLUMN IF EXISTS "reply_count",
      DROP COLUMN IF EXISTS "view_count";
  `)},name:"20260922_010000_comm_04c_forum_browsing_read_state"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS forum_topics_space_pinned_idx ON forum_topics (space_id, is_pinned DESC, last_post_timestamp DESC);
    CREATE TABLE IF NOT EXISTS forum_topic_redirects (
      id uuid PRIMARY KEY DEFAULT renegade_uuid_v7(), site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      source_topic_id uuid NOT NULL REFERENCES forum_topics(id) ON DELETE RESTRICT,
      target_topic_id uuid NOT NULL REFERENCES forum_topics(id) ON DELETE RESTRICT,
      created_by_member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      created_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT forum_topic_redirects_source_unique UNIQUE (source_topic_id),
      -- A move retains the topic identity, but records its former space as an immutable route alias.
      source_space_id uuid REFERENCES forum_spaces(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS forum_merge_audit (
      id uuid PRIMARY KEY DEFAULT renegade_uuid_v7(), site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      operation varchar(16) NOT NULL CHECK (operation IN ('move','merge','split','pin','lock','archive')),
      source_topic_id uuid NOT NULL REFERENCES forum_topics(id) ON DELETE RESTRICT,
      target_topic_id uuid REFERENCES forum_topics(id) ON DELETE RESTRICT,
      post_ids jsonb NOT NULL DEFAULT '[]'::jsonb, details jsonb NOT NULL DEFAULT '{}'::jsonb,
      actor_member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      created_at timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS forum_merge_audit_source_idx ON forum_merge_audit (source_topic_id, created_at DESC);
    ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS idempotency_key varchar(256);
    CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_idempotency_key_unique ON outbox_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
    ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS acl_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE OR REPLACE FUNCTION forum_post_immutable_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.author_id <> OLD.author_id OR NEW.created_at <> OLD.created_at
         OR NEW.reply_to_post_id IS DISTINCT FROM OLD.reply_to_post_id THEN
        RAISE EXCEPTION 'forum post identity and quote reference are immutable' USING ERRCODE = '23514';
      END IF;
      IF (NEW.topic_id <> OLD.topic_id OR NEW.sequence_number <> OLD.sequence_number)
         AND COALESCE(current_setting('renegade.forum_operation', true), '') NOT IN ('merge', 'split') THEN
        RAISE EXCEPTION 'forum post topic and sequence are immutable outside a staff operation' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION validate_forum_post_reply() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      -- A merge/split moves a complete selected set under the same transaction lock. The final
      -- state is validated by the service's selection predicate; checking each intermediate row
      -- would reject a reply whose parent has not been moved yet.
      IF current_setting('renegade.forum_operation', true) IN ('merge', 'split') THEN RETURN NEW; END IF;
      IF NEW.reply_to_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM forum_posts WHERE id = NEW.reply_to_post_id AND topic_id = NEW.topic_id
      ) THEN RAISE EXCEPTION 'quoted post must belong to the same topic' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END; $$;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE search_documents DROP COLUMN IF EXISTS acl_metadata;
    DROP INDEX IF EXISTS outbox_events_idempotency_key_unique;
    ALTER TABLE outbox_events DROP COLUMN IF EXISTS idempotency_key;
    DROP TABLE IF EXISTS forum_merge_audit;
    DROP TABLE IF EXISTS forum_topic_redirects;
    DROP INDEX IF EXISTS forum_topics_space_pinned_idx;
    ALTER TABLE forum_topics DROP COLUMN IF EXISTS is_archived, DROP COLUMN IF EXISTS is_pinned;
  `)},name:"20260922_020000_comm_04d_forum_topic_operations"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "community_policies" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "policy_key" varchar(128) NOT NULL,
      "version" integer NOT NULL CHECK ("version" > 0),
      "policy_payload" jsonb NOT NULL,
      "created_by_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "community_policies_site_key_version_unique" UNIQUE ("site_id", "policy_key", "version")
    );
    CREATE INDEX IF NOT EXISTS "community_policies_current_lookup_idx" ON "community_policies" ("site_id", "policy_key", "version" DESC);

    CREATE TABLE IF NOT EXISTS "moderation_cases" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "target_type" varchar(32) NOT NULL CHECK ("target_type" IN ('comment','forum_post','forum_topic','member_profile','message')),
      "target_id" uuid NOT NULL,
      "status" varchar(32) NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','closed')),
      "opened_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "last_reported_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "moderation_cases_coalesce_idx" ON "moderation_cases" ("site_id", "target_type", "target_id", "last_reported_at" DESC);

    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "parent_case_id" uuid REFERENCES "moderation_cases"("id") ON DELETE SET NULL;
    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "target_snapshot_payload" jsonb;
    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "target_snapshot_hash" varchar(64);
    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "policy_id" uuid REFERENCES "community_policies"("id") ON DELETE SET NULL;
    ALTER TABLE "community_reports" ADD COLUMN IF NOT EXISTS "policy_version" integer;
    ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_target_type_check" CHECK ("target_type" IN ('comment','forum_post','forum_topic','member_profile','message','post','discussion','member')) NOT VALID;
    CREATE INDEX IF NOT EXISTS "community_reports_parent_case_idx" ON "community_reports" ("parent_case_id");

    CREATE OR REPLACE FUNCTION "community_policy_versions_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'community policy versions are immutable' USING ERRCODE = '23514'; END; $$;
    DROP TRIGGER IF EXISTS "community_policies_immutable" ON "community_policies";
    CREATE TRIGGER "community_policies_immutable" BEFORE UPDATE OR DELETE ON "community_policies"
      FOR EACH ROW EXECUTE FUNCTION "community_policy_versions_immutable"();
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TRIGGER IF EXISTS "community_policies_immutable" ON "community_policies";
    DROP FUNCTION IF EXISTS "community_policy_versions_immutable"();
    ALTER TABLE "community_reports" DROP CONSTRAINT IF EXISTS "community_reports_target_type_check";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "policy_version";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "policy_id";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "target_snapshot_hash";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "target_snapshot_payload";
    ALTER TABLE "community_reports" DROP COLUMN IF EXISTS "parent_case_id";
    DROP TABLE IF EXISTS "moderation_cases";
    DROP TABLE IF EXISTS "community_policies";
  `)},name:"20260922_030000_comm_05a_moderation_registry_reports"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "closed_at" timestamp(3) with time zone;
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "closed_by_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "case_id" uuid REFERENCES "moderation_cases"("id") ON DELETE SET NULL;
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "scope" varchar(16) NOT NULL DEFAULT 'object' CHECK ("scope" IN ('object','space','site_global'));
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "expires_at" timestamp(3) with time zone;
    ALTER TABLE "moderation_actions" ADD COLUMN IF NOT EXISTS "actor_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "moderation_actions_case_idx" ON "moderation_actions" ("case_id", "occurred_at" DESC);

    CREATE TABLE IF NOT EXISTS "member_sanctions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "action_id" uuid NOT NULL REFERENCES "moderation_actions"("id") ON DELETE RESTRICT,
      "sanction_type" varchar(32) NOT NULL CHECK ("sanction_type" IN ('suspend_posting','ban_member')),
      "scope" varchar(16) NOT NULL CHECK ("scope" IN ('object','space','site_global')),
      "scope_id" uuid,
      "starts_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "expires_at" timestamp(3) with time zone,
      "revoked_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CHECK (("scope" = 'site_global' AND "scope_id" IS NULL) OR ("scope" <> 'site_global' AND "scope_id" IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS "member_sanctions_active_lookup_idx" ON "member_sanctions" ("site_id", "member_id", "scope", "scope_id", "expires_at") WHERE "revoked_at" IS NULL;

    ALTER TABLE "forum_topics" ADD COLUMN IF NOT EXISTS "is_quarantined" boolean NOT NULL DEFAULT false;
    ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "is_quarantined" boolean NOT NULL DEFAULT false;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "forum_posts" DROP COLUMN IF EXISTS "is_quarantined";
    ALTER TABLE "forum_topics" DROP COLUMN IF EXISTS "is_quarantined";
    DROP TABLE IF EXISTS "member_sanctions";
    DROP INDEX IF EXISTS "moderation_actions_case_idx";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "actor_member_id";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "expires_at";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "scope_id";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "scope";
    ALTER TABLE "moderation_actions" DROP COLUMN IF EXISTS "case_id";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "closed_by_member_id";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "closed_at";
  `)},name:"20260922_040000_comm_05b_moderation_actions_sanctions"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    -- Keep appeal references tenant-bound even when somebody bypasses the service layer.
    CREATE UNIQUE INDEX IF NOT EXISTS "moderation_actions_site_id_id_unique" ON "moderation_actions" ("site_id", "id");
    CREATE TABLE IF NOT EXISTS "moderation_appeals" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "moderation_action_id" uuid NOT NULL,
      "appellant_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "reason" text NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','accepted','rejected')),
      "reviewed_by_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "reviewed_at" timestamp(3) with time zone,
      "decision_reason" text,
      "reversal_action_id" uuid,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "moderation_appeals_one_per_action" UNIQUE ("moderation_action_id"),
      CONSTRAINT "moderation_appeals_action_site_fk" FOREIGN KEY ("site_id", "moderation_action_id") REFERENCES "moderation_actions" ("site_id", "id") ON DELETE RESTRICT,
      CONSTRAINT "moderation_appeals_reversal_site_fk" FOREIGN KEY ("site_id", "reversal_action_id") REFERENCES "moderation_actions" ("site_id", "id") ON DELETE RESTRICT,
      CHECK (("status" = 'pending' AND "reviewed_at" IS NULL AND "reviewed_by_member_id" IS NULL AND "decision_reason" IS NULL AND "reversal_action_id" IS NULL)
        OR ("status" = 'accepted' AND "reviewed_at" IS NOT NULL AND "reviewed_by_member_id" IS NOT NULL AND "decision_reason" IS NOT NULL AND "reversal_action_id" IS NOT NULL)
        OR ("status" = 'rejected' AND "reviewed_at" IS NOT NULL AND "reviewed_by_member_id" IS NOT NULL AND "decision_reason" IS NOT NULL AND "reversal_action_id" IS NULL))
    );
    CREATE INDEX IF NOT EXISTS "moderation_appeals_pending_idx" ON "moderation_appeals" ("site_id", "status", "created_at") WHERE "status" = 'pending';

    CREATE TABLE IF NOT EXISTS "community_audit_log" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "event_type" varchar(96) NOT NULL,
      "event_payload" jsonb NOT NULL,
      "previous_hash" varchar(64),
      "record_hash" varchar(64) NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "community_audit_log_chain_idx" ON "community_audit_log" ("site_id", "created_at", "id");

    CREATE OR REPLACE FUNCTION "community_audit_log_chain_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE prior_hash text;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext(NEW.site_id::text));
      SELECT record_hash INTO prior_hash FROM community_audit_log WHERE site_id = NEW.site_id ORDER BY created_at DESC, id DESC LIMIT 1;
      NEW.previous_hash := prior_hash;
      NEW.record_hash := encode(digest(coalesce(prior_hash, '') || NEW.event_type || NEW.event_payload::text, 'sha256'), 'hex');
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION "community_audit_log_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'community audit log is append-only' USING ERRCODE = '23514'; END; $$;
    DROP TRIGGER IF EXISTS "community_audit_log_hash_chain" ON "community_audit_log";
    CREATE TRIGGER "community_audit_log_hash_chain" BEFORE INSERT ON "community_audit_log" FOR EACH ROW EXECUTE FUNCTION "community_audit_log_chain_insert"();
    DROP TRIGGER IF EXISTS "community_audit_log_no_mutation" ON "community_audit_log";
    CREATE TRIGGER "community_audit_log_no_mutation" BEFORE UPDATE OR DELETE ON "community_audit_log" FOR EACH ROW EXECUTE FUNCTION "community_audit_log_immutable"();
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TRIGGER IF EXISTS "community_audit_log_no_mutation" ON "community_audit_log";
    DROP TRIGGER IF EXISTS "community_audit_log_hash_chain" ON "community_audit_log";
    DROP FUNCTION IF EXISTS "community_audit_log_immutable"();
    DROP FUNCTION IF EXISTS "community_audit_log_chain_insert"();
    DROP TABLE IF EXISTS "community_audit_log";
    DROP TABLE IF EXISTS "moderation_appeals";
    DROP INDEX IF EXISTS "moderation_actions_site_id_id_unique";
  `)},name:"20260922_050000_comm_05c_moderation_appeals_audit"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "priority" varchar(16) NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('low','normal','high','urgent'));
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "rule_categories" jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "sla_deadline" timestamp(3) with time zone;
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "triage_payload" jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE "moderation_cases" ADD COLUMN IF NOT EXISTS "disposition" varchar(32);
    -- Forum posts previously only had a quarantine bit.  Keep that bit for the
    -- public-read projection, while recording the distinct human-review state.
    ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "review_status" varchar(32) NOT NULL DEFAULT 'visible' CHECK ("review_status" IN ('visible','pending_review','resolved'));
    CREATE INDEX IF NOT EXISTS "moderation_cases_console_idx" ON "moderation_cases" ("site_id", "status", "priority", "sla_deadline");
    CREATE TABLE IF NOT EXISTS "community_abuse_heuristic_configs" (
      "site_id" uuid PRIMARY KEY REFERENCES "sites"("id") ON DELETE CASCADE,
      "config" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS "moderation_submission_fingerprints" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "author_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE, "target_type" varchar(32) NOT NULL, "target_id" uuid NOT NULL,
      "fingerprint" varchar(16) NOT NULL, "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "moderation_submission_fingerprints_velocity_idx" ON "moderation_submission_fingerprints" ("site_id","author_id","created_at" DESC);
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "moderation_submission_fingerprints";
    DROP TABLE IF EXISTS "community_abuse_heuristic_configs";
    DROP INDEX IF EXISTS "moderation_cases_console_idx";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "disposition";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "triage_payload";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "sla_deadline";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "rule_categories";
    ALTER TABLE "moderation_cases" DROP COLUMN IF EXISTS "priority";
    ALTER TABLE "forum_posts" DROP COLUMN IF EXISTS "review_status";
  `)},name:"20260922_060000_comm_05d_abuse_triage_console"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "conversations" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "kind" varchar(16) NOT NULL CHECK ("kind" IN ('direct','group')),
      "status" varchar(16) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','archived')),
      "title" varchar(256), "avatar_url" text,
      "direct_member_low_id" uuid REFERENCES "members"("id") ON DELETE RESTRICT,
      "direct_member_high_id" uuid REFERENCES "members"("id") ON DELETE RESTRICT,
      "next_message_sequence" integer NOT NULL DEFAULT 1 CHECK ("next_message_sequence" >= 1),
      "last_message_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "conversations_direct_pair_shape" CHECK ((kind = 'direct' AND direct_member_low_id IS NOT NULL AND direct_member_high_id IS NOT NULL AND direct_member_low_id <> direct_member_high_id) OR (kind = 'group' AND direct_member_low_id IS NULL AND direct_member_high_id IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "conversations_active_direct_pair_unique" ON "conversations" ("site_id", "direct_member_low_id", "direct_member_high_id") WHERE "kind" = 'direct' AND "status" = 'active';
    CREATE INDEX IF NOT EXISTS "conversations_site_last_message_idx" ON "conversations" ("site_id", "last_message_at" DESC);
    CREATE TABLE IF NOT EXISTS "conversation_memberships" (
      "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "joined_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "left_at" timestamp(3) with time zone,
      PRIMARY KEY ("conversation_id", "member_id")
    );
    CREATE INDEX IF NOT EXISTS "conversation_memberships_member_active_idx" ON "conversation_memberships" ("member_id", "conversation_id") WHERE "left_at" IS NULL;
    CREATE TABLE IF NOT EXISTS "messages" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
      "sender_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE RESTRICT,
      "idempotency_key" varchar(255) NOT NULL,
      "sequence_number" integer NOT NULL CHECK ("sequence_number" >= 1),
      "body_html" text NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "messages_conversation_sequence_unique" UNIQUE ("conversation_id", "sequence_number"),
      CONSTRAINT "messages_conversation_idempotency_unique" UNIQUE ("conversation_id", "idempotency_key")
    );
    CREATE INDEX IF NOT EXISTS "messages_conversation_sequence_idx" ON "messages" ("conversation_id", "sequence_number");
    CREATE OR REPLACE FUNCTION "messages_require_active_membership"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM conversation_memberships WHERE conversation_id = NEW.conversation_id AND member_id = NEW.sender_id AND left_at IS NULL) THEN
        RAISE EXCEPTION 'active conversation membership required' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END; $$;
    DROP TRIGGER IF EXISTS "messages_active_membership" ON "messages";
    CREATE TRIGGER "messages_active_membership" BEFORE INSERT ON "messages" FOR EACH ROW EXECUTE FUNCTION "messages_require_active_membership"();
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TRIGGER IF EXISTS "messages_active_membership" ON "messages";
    DROP FUNCTION IF EXISTS "messages_require_active_membership"();
    DROP TABLE IF EXISTS "messages"; DROP TABLE IF EXISTS "conversation_memberships"; DROP TABLE IF EXISTS "conversations";
  `)},name:"20260922_070000_comm_07a_conversations"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "request_state" varchar(20) NOT NULL DEFAULT 'active' CHECK ("request_state" IN ('pending_request','active','declined'));
    ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "request_recipient_member_id" uuid REFERENCES "members"("id") ON DELETE RESTRICT;
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_request_recipient_shape" CHECK ((request_state='pending_request' AND request_recipient_member_id IS NOT NULL) OR (request_state IN ('active','declined')));
    CREATE TABLE IF NOT EXISTS "message_request_attempts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "sender_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE, "recipient_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE, "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "message_request_attempts_sender_window_idx" ON "message_request_attempts" ("site_id","sender_id","created_at" DESC);
  `)},down:async function a({db:b}){await b.execute(aa.sql`
  DROP TABLE IF EXISTS "message_request_attempts";
  ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_request_recipient_shape";
  ALTER TABLE "conversations" DROP COLUMN IF EXISTS "request_recipient_member_id";
  ALTER TABLE "conversations" DROP COLUMN IF EXISTS "request_state";
`)},name:"20260922_080000_comm_07b_message_requests"},{up:async function a({db:b}){await b.execute(aa.sql`
  CREATE TABLE IF NOT EXISTS "message_attachments" (
    "id" uuid PRIMARY KEY, "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
    "owner_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
    "message_id" uuid REFERENCES "messages"("id") ON DELETE CASCADE,
    "storage_key" text NOT NULL UNIQUE, "original_filename" varchar(255) NOT NULL,
    "claimed_mime_type" varchar(100) NOT NULL CHECK ("claimed_mime_type" IN ('image/jpeg','image/png','image/webp','application/pdf')),
    "byte_size" integer NOT NULL CHECK ("byte_size" > 0 AND "byte_size" <= 10485760),
    "status" varchar(20) NOT NULL DEFAULT 'pending_scan' CHECK ("status" IN ('pending_scan','clean','quarantined','rejected')),
    "upload_expires_at" timestamp(3) with time zone NOT NULL, "scanned_at" timestamp(3) with time zone,
    "linked_at" timestamp(3) with time zone, "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS "message_attachments_orphan_cleanup_idx" ON "message_attachments" ("created_at") WHERE "message_id" IS NULL;
  CREATE INDEX IF NOT EXISTS "message_attachments_message_idx" ON "message_attachments" ("message_id");
`)},down:async function a({db:b}){await b.execute(aa.sql`DROP TABLE IF EXISTS "message_attachments";`)},name:"20260922_090000_comm_07c_message_attachments"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "conversation_memberships"
      ADD COLUMN IF NOT EXISTS "role" varchar(16) NOT NULL DEFAULT 'member'
        CHECK ("role" IN ('admin','member')),
      ADD COLUMN IF NOT EXISTS "visible_from_sequence" integer NOT NULL DEFAULT 1
        CHECK ("visible_from_sequence" >= 1);
    ALTER TABLE "messages"
      ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'member'
        CHECK ("kind" IN ('member','system')),
      ADD COLUMN IF NOT EXISTS "system_event" varchar(48);
    ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;
    ALTER TABLE "messages" ADD CONSTRAINT "messages_system_shape"
      CHECK (("kind" = 'member' AND "sender_id" IS NOT NULL AND "system_event" IS NULL)
        OR ("kind" = 'system' AND "sender_id" IS NULL AND "system_event" IS NOT NULL)) NOT VALID;
    CREATE INDEX IF NOT EXISTS "conversation_memberships_active_group_role_idx"
      ON "conversation_memberships" ("conversation_id", "role") WHERE "left_at" IS NULL;
    CREATE OR REPLACE FUNCTION "messages_require_active_membership"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind = 'member' AND NOT EXISTS (SELECT 1 FROM conversation_memberships WHERE conversation_id = NEW.conversation_id AND member_id = NEW.sender_id AND left_at IS NULL) THEN
        RAISE EXCEPTION 'active conversation membership required' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE OR REPLACE FUNCTION "system_messages_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.kind = 'system' THEN
        RAISE EXCEPTION 'system messages are immutable' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    DROP TRIGGER IF EXISTS "system_messages_immutable_update" ON "messages";
    DROP TRIGGER IF EXISTS "system_messages_immutable_delete" ON "messages";
    CREATE TRIGGER "system_messages_immutable_update" BEFORE UPDATE ON "messages" FOR EACH ROW EXECUTE FUNCTION "system_messages_immutable"();
    CREATE TRIGGER "system_messages_immutable_delete" BEFORE DELETE ON "messages" FOR EACH ROW EXECUTE FUNCTION "system_messages_immutable"();
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP INDEX IF EXISTS "conversation_memberships_active_group_role_idx";
    DROP TRIGGER IF EXISTS "system_messages_immutable_update" ON "messages";
    DROP TRIGGER IF EXISTS "system_messages_immutable_delete" ON "messages";
    DROP FUNCTION IF EXISTS "system_messages_immutable"();
    ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_system_shape";
    ALTER TABLE "messages" DROP COLUMN IF EXISTS "system_event", DROP COLUMN IF EXISTS "kind";
    ALTER TABLE "messages" ALTER COLUMN "sender_id" SET NOT NULL;
    ALTER TABLE "conversation_memberships" DROP COLUMN IF EXISTS "visible_from_sequence", DROP COLUMN IF EXISTS "role";
  `)},name:"20260922_100000_comm_07d_group_administration"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "inbox_notifications" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "recipient_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "actor_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "source_event_id" uuid REFERENCES "outbox_events"("id") ON DELETE CASCADE,
      "kind" varchar(128) NOT NULL,
      "target_type" varchar(32) NOT NULL,
      "target_id" uuid NOT NULL,
      "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "read_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "inbox_notifications_source_recipient_unique" UNIQUE ("source_event_id", "recipient_member_id")
    );
    CREATE INDEX IF NOT EXISTS "inbox_notifications_member_keyset_idx"
      ON "inbox_notifications" ("recipient_member_id", "site_id", "created_at" DESC, "id" DESC);
    CREATE INDEX IF NOT EXISTS "inbox_notifications_member_unread_idx"
      ON "inbox_notifications" ("recipient_member_id", "site_id") WHERE "read_at" IS NULL;

    CREATE TABLE IF NOT EXISTS "member_notification_counters" (
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "unread_count" integer NOT NULL DEFAULT 0 CHECK ("unread_count" >= 0),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("site_id", "member_id")
    );
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "member_notification_counters";
    DROP TABLE IF EXISTS "inbox_notifications";
  `)},name:"20260922_110000_comm_06b_inbox_projections"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "notification_preferences" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "channel" varchar(32) NOT NULL DEFAULT 'email',
      "kind" varchar(64) NOT NULL DEFAULT 'all',
      "frequency" varchar(32) NOT NULL DEFAULT 'immediate',
      "rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "notification_preferences_site_member_channel_kind_unique" UNIQUE ("site_id", "member_id", "channel", "kind")
    );

    -- The Payload collection predates COMM-06C and owns this table. Reconcile
    -- its original member-level preferences instead of treating the existing
    -- relation as proof that the delivery fields have already been installed.
    ALTER TABLE "notification_preferences"
      ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS "channel" varchar(32) NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "kind" varchar(64) NOT NULL DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS "frequency" varchar(32) NOT NULL DEFAULT 'immediate';
  `),await b.execute(aa.sql`
    CREATE INDEX IF NOT EXISTS "notification_preferences_member_site_idx"
      ON "notification_preferences" ("member_id", "site_id");
  `),await b.execute(aa.sql`
    DO $$ BEGIN
      ALTER TABLE "notification_preferences"
        ADD CONSTRAINT "notification_preferences_site_member_channel_kind_unique"
        UNIQUE ("site_id", "member_id", "channel", "kind");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `),await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "audience_delivery_outbox" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "recipient_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
      "channel" varchar(32) NOT NULL,
      "envelope" jsonb NOT NULL,
      "status" varchar(32) NOT NULL DEFAULT 'pending',
      "scheduled_for" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "dispatched_at" timestamp(3) with time zone,
      "error" text
    );

    ALTER TABLE "audience_delivery_outbox"
      ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS "recipient_id" uuid REFERENCES "members"("id") ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS "channel" varchar(32) NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "envelope" jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp(3) with time zone NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "dispatched_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "error" text;
  `),await b.execute(aa.sql`
    CREATE INDEX IF NOT EXISTS "audience_delivery_outbox_pending_idx"
      ON "audience_delivery_outbox" ("status", "scheduled_for") WHERE "status" = 'pending';
    CREATE INDEX IF NOT EXISTS "audience_delivery_outbox_recipient_idx"
      ON "audience_delivery_outbox" ("recipient_id", "site_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "audience_delivery_outbox";
    DROP TABLE IF EXISTS "notification_preferences";
  `)},name:"20260922_120000_comm_06c_notification_preferences_and_outbox"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "order_lines" jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reconciliation_status" varchar(32) NOT NULL DEFAULT 'verified';
    CREATE TABLE IF NOT EXISTS "commerce_reconciliation_cases" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "legacy_type" varchar(80) NOT NULL,
      "legacy_id" varchar(160) NOT NULL,
      "reason" varchar(120) NOT NULL,
      "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "status" varchar(32) NOT NULL DEFAULT 'quarantined',
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "resolved_at" timestamp(3) with time zone,
      CONSTRAINT "commerce_reconciliation_cases_legacy_unique" UNIQUE ("legacy_type", "legacy_id")
    );
    CREATE INDEX IF NOT EXISTS "commerce_reconciliation_cases_open_idx" ON "commerce_reconciliation_cases" ("site_id", "status") WHERE "status" = 'quarantined';
    CREATE TABLE IF NOT EXISTS "commerce_fulfillment_instructions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
      "kind" varchar(32) NOT NULL,
      "state" varchar(32) NOT NULL DEFAULT 'pending',
      "instruction" jsonb NOT NULL,
      "provider_reference" varchar(200),
      "idempotency_key" varchar(200) NOT NULL,
      "failure" jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "commerce_fulfillment_instructions_idempotency_unique" UNIQUE ("idempotency_key")
    );
    CREATE TABLE IF NOT EXISTS "commerce_payment_attempts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "payment_intent_id" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE CASCADE,
      "provider_reference" varchar(200),
      "state" varchar(32) NOT NULL DEFAULT 'created',
      "verified_evidence" jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "commerce_payment_attempts";
    DROP TABLE IF EXISTS "commerce_fulfillment_instructions";
    DROP TABLE IF EXISTS "commerce_reconciliation_cases";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "reconciliation_status";
    ALTER TABLE "payment_intents" DROP COLUMN IF EXISTS "order_lines";
  `)},name:"20260922_130000_commerce_canonical_contract"},{up:async function a({db:b}){await b.execute(aa.sql`
    -- Correct malformed UUIDv7 output for databases that already applied the
    -- original community migration. UUID fields require the canonical 8-4-4-4-12 layout.
    CREATE OR REPLACE FUNCTION "renegade_uuid_v7"() RETURNS uuid
    LANGUAGE sql VOLATILE AS $$
      WITH parts AS (
        SELECT
          lpad(to_hex(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint), 12, '0') AS ts,
          encode(gen_random_bytes(10), 'hex') AS random_hex
      )
      SELECT (
        substr(ts, 1, 8) || '-' || substr(ts, 9, 4) ||
        '-7' || substr(random_hex, 1, 3) ||
        '-8' || substr(random_hex, 4, 3) ||
        '-' || substr(random_hex, 7, 12)
      )::uuid
      FROM parts;
    $$;

    -- The current Site configuration owns this array relation. Older baseline
    -- snapshots predate it, so install it before a production runtime reads
    -- Site records (including the storefront host resolver).
    CREATE TABLE IF NOT EXISTS "sites_comment_reaction_codes" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "parent_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "value" varchar NOT NULL,
      "order" integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS "sites_comment_reaction_codes_parent_idx"
      ON "sites_comment_reaction_codes" ("parent_id");

    ALTER TYPE "enum_products_kind" ADD VALUE IF NOT EXISTS 'donation';
    ALTER TYPE "enum_products_kind" ADD VALUE IF NOT EXISTS 'affiliate';
    ALTER TYPE "enum_products_variants_inventory_policy" ADD VALUE IF NOT EXISTS 'affiliate';
    ALTER TYPE "enum_products_variants_inventory_policy" ADD VALUE IF NOT EXISTS 'pod';
    DO $$ BEGIN CREATE TYPE "enum_products_variants_status" AS ENUM ('active', 'unavailable', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "enum_digital_download_events_outcome" AS ENUM ('allowed', 'denied'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "enum_catalog_import_runs_mode" AS ENUM ('dry-run', 'apply'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "enum_catalog_import_runs_status" AS ENUM ('planned', 'applied', 'replayed', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "products" ALTER COLUMN "merchant_connection_id" DROP NOT NULL;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "catalog_contract_version" numeric DEFAULT 1 NOT NULL;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "summary" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "archived_at" timestamp(3) with time zone;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "redirect_to" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "option_dimensions" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "offers" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "digital_delivery" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "affiliate_policy" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pod_mappings" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "disclosures" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "workflow_audit" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "revision_snapshots" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "published_presentation" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_title" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_description" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_canonical_u_r_l" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_image_alt" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_keywords" jsonb;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_focus_keyphrase" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_no_index" boolean DEFAULT false;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "discovery_overrides" jsonb;
    DROP INDEX IF EXISTS "products_canonical_path_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "products_site_slug_idx" ON "products" ("site_id", "slug");
    CREATE UNIQUE INDEX IF NOT EXISTS "products_site_canonical_path_idx" ON "products" ("site_id", "canonical_path");

    ALTER TABLE "products_variants" ADD COLUMN IF NOT EXISTS "option_values" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "products_variants" ADD COLUMN IF NOT EXISTS "status" "enum_products_variants_status" DEFAULT 'active';
    ALTER TABLE "products_variants" ADD COLUMN IF NOT EXISTS "weight_grams" numeric;
    ALTER TABLE "products_variants" ADD COLUMN IF NOT EXISTS "dimensions_mm" jsonb;

    ALTER TABLE "products_rels" ADD COLUMN IF NOT EXISTS "topics_id" uuid;
    ALTER TABLE "products_rels" ADD COLUMN IF NOT EXISTS "tags_id" uuid;
    ALTER TABLE "products_rels" ADD COLUMN IF NOT EXISTS "products_id" uuid;
    DO $$ BEGIN ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "topics"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "tags"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "products"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "products_rels_topics_id_idx" ON "products_rels" ("topics_id");
    CREATE INDEX IF NOT EXISTS "products_rels_tags_id_idx" ON "products_rels" ("tags_id");
    CREATE INDEX IF NOT EXISTS "products_rels_products_id_idx" ON "products_rels" ("products_id");

    CREATE TABLE IF NOT EXISTS "digital_delivery_grants" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null, "space_id" uuid REFERENCES "spaces"("id") ON DELETE set null,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE set null, "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE restrict,
      "variant_sku" varchar NOT NULL, "entitlement_id" uuid NOT NULL REFERENCES "entitlements"("id") ON DELETE restrict,
      "member_id" uuid REFERENCES "members"("id") ON DELETE set null, "media_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE restrict,
      "grant_key_hash" varchar NOT NULL, "download_limit" numeric, "download_count" numeric DEFAULT 0 NOT NULL,
      "expires_at" timestamp(3) with time zone, "revoked_at" timestamp(3) with time zone, "last_downloaded_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "digital_delivery_grants_grant_key_hash_unique" UNIQUE ("grant_key_hash")
    );
    CREATE INDEX IF NOT EXISTS "digital_delivery_grants_site_idx" ON "digital_delivery_grants" ("site_id");
    CREATE INDEX IF NOT EXISTS "digital_delivery_grants_member_idx" ON "digital_delivery_grants" ("member_id");

    CREATE TABLE IF NOT EXISTS "digital_download_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null, "space_id" uuid REFERENCES "spaces"("id") ON DELETE set null,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE set null, "grant_id" uuid NOT NULL REFERENCES "digital_delivery_grants"("id") ON DELETE restrict,
      "media_asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE restrict, "occurred_at" timestamp(3) with time zone NOT NULL,
      "outcome" "enum_digital_download_events_outcome" NOT NULL, "reason" varchar, "request_fingerprint" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "digital_download_events_site_idx" ON "digital_download_events" ("site_id");
    CREATE INDEX IF NOT EXISTS "digital_download_events_grant_idx" ON "digital_download_events" ("grant_id");

    CREATE TABLE IF NOT EXISTS "catalog_import_runs" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE set null, "space_id" uuid REFERENCES "spaces"("id") ON DELETE set null,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE set null, "checksum" varchar NOT NULL, "mode" "enum_catalog_import_runs_mode" NOT NULL,
      "status" "enum_catalog_import_runs_status" NOT NULL, "source" varchar NOT NULL, "summary" jsonb NOT NULL, "applied_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "catalog_import_runs_site_checksum_mode_unique" UNIQUE ("site_id", "checksum", "mode")
    );
    CREATE INDEX IF NOT EXISTS "catalog_import_runs_site_idx" ON "catalog_import_runs" ("site_id");
    CREATE INDEX IF NOT EXISTS "catalog_import_runs_checksum_idx" ON "catalog_import_runs" ("checksum");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "catalog_import_runs";
    DROP TABLE IF EXISTS "digital_download_events";
    DROP TABLE IF EXISTS "digital_delivery_grants";
    ALTER TABLE "products_rels" DROP COLUMN IF EXISTS "products_id", DROP COLUMN IF EXISTS "tags_id", DROP COLUMN IF EXISTS "topics_id";
    ALTER TABLE "products_variants" DROP COLUMN IF EXISTS "dimensions_mm", DROP COLUMN IF EXISTS "weight_grams", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "option_values";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "discovery_overrides", DROP COLUMN IF EXISTS "seo_no_index", DROP COLUMN IF EXISTS "seo_focus_keyphrase", DROP COLUMN IF EXISTS "seo_keywords", DROP COLUMN IF EXISTS "seo_image_alt", DROP COLUMN IF EXISTS "seo_canonical_u_r_l", DROP COLUMN IF EXISTS "seo_description", DROP COLUMN IF EXISTS "seo_title", DROP COLUMN IF EXISTS "published_presentation", DROP COLUMN IF EXISTS "revision_snapshots", DROP COLUMN IF EXISTS "workflow_audit", DROP COLUMN IF EXISTS "disclosures", DROP COLUMN IF EXISTS "pod_mappings", DROP COLUMN IF EXISTS "affiliate_policy", DROP COLUMN IF EXISTS "digital_delivery", DROP COLUMN IF EXISTS "offers", DROP COLUMN IF EXISTS "option_dimensions", DROP COLUMN IF EXISTS "product_capabilities", DROP COLUMN IF EXISTS "redirect_to", DROP COLUMN IF EXISTS "archived_at", DROP COLUMN IF EXISTS "published_at", DROP COLUMN IF EXISTS "summary", DROP COLUMN IF EXISTS "catalog_contract_version";
    DROP INDEX IF EXISTS "products_site_canonical_path_idx";
    DROP INDEX IF EXISTS "products_site_slug_idx";
    CREATE INDEX IF NOT EXISTS "products_canonical_path_idx" ON "products" ("canonical_path");
    DROP TYPE IF EXISTS "enum_catalog_import_runs_status";
    DROP TYPE IF EXISTS "enum_catalog_import_runs_mode";
    DROP TYPE IF EXISTS "enum_digital_download_events_outcome";
    DROP TYPE IF EXISTS "enum_products_variants_status";
  `)},name:"20260923_010000_shop_01_catalog_workflows"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "version" numeric DEFAULT 1 NOT NULL;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "guest_token_hash" varchar;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "member_id" uuid;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "customer_email" varchar;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "applied_coupon_codes" jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "shipping_address" jsonb;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "billing_address" jsonb;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "selected_shipping_rate_id" varchar;
    ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "reconciliation_notes" jsonb DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS "carts_guest_token_hash_idx" ON "carts" ("guest_token_hash");

    DO $$ BEGIN
      ALTER TABLE "carts" ADD CONSTRAINT "carts_member_id_members_id_fk"
        FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "promotions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "version" numeric DEFAULT 1 NOT NULL,
      "code" varchar NOT NULL,
      "description" varchar NOT NULL,
      "scope" varchar DEFAULT 'order' NOT NULL,
      "discount_type" varchar DEFAULT 'fixed-minor' NOT NULL,
      "discount_value" varchar NOT NULL,
      "max_discount_minor" varchar,
      "currency" varchar NOT NULL,
      "starts_at" timestamp(3) with time zone,
      "ends_at" timestamp(3) with time zone,
      "timezone" varchar,
      "status" varchar DEFAULT 'active' NOT NULL,
      "stacking_rule" varchar DEFAULT 'stackable' NOT NULL,
      "stacking_priority" numeric DEFAULT 0 NOT NULL,
      "usage_limit_total" numeric,
      "usage_count" numeric DEFAULT 0 NOT NULL,
      "usage_limit_per_customer" numeric,
      "eligibility" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "promotions_site_code_idx" ON "promotions" ("site_id", "code");

    CREATE TABLE IF NOT EXISTS "checkout_proposals" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "cart_id" uuid NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
      "merchant_connection_id" uuid REFERENCES "merchant_connections"("id") ON DELETE SET NULL,
      "cart_version" numeric NOT NULL,
      "currency" varchar NOT NULL,
      "customer" jsonb NOT NULL,
      "shipping_address" jsonb,
      "billing_address" jsonb,
      "selected_shipping_rate" jsonb,
      "pricing_snapshot" jsonb NOT NULL,
      "tax_snapshot" jsonb,
      "consents" jsonb NOT NULL,
      "fulfillment_split" jsonb NOT NULL,
      "integrity_hash" varchar NOT NULL,
      "state" varchar DEFAULT 'active' NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "checkout_proposals_site_integrity_idx" ON "checkout_proposals" ("site_id", "integrity_hash");

    CREATE TABLE IF NOT EXISTS "inventory_reservations" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "cart_id" uuid NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
      "proposal_id" uuid REFERENCES "checkout_proposals"("id") ON DELETE SET NULL,
      "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      "variant_sku" varchar NOT NULL,
      "quantity" numeric NOT NULL,
      "status" varchar DEFAULT 'active' NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "inventory_reservations_site_sku_status_idx" ON "inventory_reservations" ("site_id", "variant_sku", "status");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "inventory_reservations";
    DROP TABLE IF EXISTS "checkout_proposals";
    DROP TABLE IF EXISTS "promotions";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "reconciliation_notes";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "selected_shipping_rate_id";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "billing_address";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "shipping_address";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "applied_coupon_codes";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "customer_email";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "member_id";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "guest_token_hash";
    ALTER TABLE "carts" DROP COLUMN IF EXISTS "version";
  `)},name:"20260923_020000_shop_02_carts_and_checkout_proposals"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "proposal_id" uuid REFERENCES "checkout_proposals"("id") ON DELETE SET NULL;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "binding_key" varchar;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "customer_key" varchar;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "attempt" numeric NOT NULL DEFAULT 1;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "guest_access_token_hash" varchar;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "return_path" varchar;
    ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "cancel_path" varchar;
    CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_binding_key_idx" ON "checkout_sessions" ("binding_key") WHERE "binding_key" IS NOT NULL;

    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "party_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "address_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "totals_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "terms_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source_snapshot" jsonb;
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "downstream_instructions" jsonb NOT NULL DEFAULT '[]'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS "orders_checkout_session_unique_idx" ON "orders" ("checkout_session_id");

    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp(3) with time zone;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "sequence" numeric;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "normalized_kind" varchar;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "provider_reference" varchar;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "sanitized_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "processing_state" varchar NOT NULL DEFAULT 'received';
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "attempts" numeric NOT NULL DEFAULT 0;
    ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "last_error" varchar;
    CREATE INDEX IF NOT EXISTS "payment_webhook_events_provider_reference_idx" ON "payment_webhook_events" ("provider_reference");

    CREATE TABLE IF NOT EXISTS "payment_attempts" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "checkout_session_id" uuid NOT NULL REFERENCES "checkout_sessions"("id") ON DELETE CASCADE,
      "payment_intent_id" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE CASCADE,
      "proposal_id" uuid REFERENCES "checkout_proposals"("id") ON DELETE SET NULL,
      "merchant_connection_id" uuid NOT NULL REFERENCES "merchant_connections"("id") ON DELETE RESTRICT,
      "attempt" numeric NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "provider_key" varchar NOT NULL,
      "provider_contract_version" varchar NOT NULL,
      "provider_implementation_version" varchar NOT NULL,
      "provider_api_version" varchar NOT NULL,
      "provider_reference" varchar,
      "provider_payment_reference" varchar,
      "amount_minor" varchar NOT NULL,
      "currency" varchar NOT NULL,
      "state" varchar NOT NULL DEFAULT 'initiated',
      "refunded_amount_minor" varchar NOT NULL DEFAULT '0',
      "last_provider_sequence" numeric,
      "processed_event_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "unknown_since" timestamp(3) with time zone,
      "last_reconciled_at" timestamp(3) with time zone,
      "next_reconcile_at" timestamp(3) with time zone,
      "failure" jsonb,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "payment_attempts_idempotency_unique" UNIQUE ("idempotency_key"),
      CONSTRAINT "payment_attempts_session_attempt_unique" UNIQUE ("checkout_session_id", "attempt")
    );
    CREATE INDEX IF NOT EXISTS "payment_attempts_site_idx" ON "payment_attempts" ("site_id");
    CREATE INDEX IF NOT EXISTS "payment_attempts_provider_reference_idx" ON "payment_attempts" ("provider_key", "provider_reference");
    CREATE INDEX IF NOT EXISTS "payment_attempts_reconcile_idx" ON "payment_attempts" ("state", "next_reconcile_at");

    CREATE TABLE IF NOT EXISTS "commerce_refunds" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
      "payment_attempt_id" uuid NOT NULL REFERENCES "payment_attempts"("id") ON DELETE RESTRICT,
      "idempotency_key" varchar NOT NULL UNIQUE,
      "amount_minor" varchar NOT NULL,
      "currency" varchar NOT NULL,
      "kind" varchar NOT NULL,
      "state" varchar NOT NULL DEFAULT 'previewed',
      "reason" varchar NOT NULL,
      "requested_by" varchar NOT NULL,
      "approved_by" varchar,
      "provider_refund_reference" varchar,
      "provider_evidence" jsonb,
      "downstream_policy" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "correction_receipt" jsonb,
      "audit_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "commerce_refunds_site_idx" ON "commerce_refunds" ("site_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "commerce_refunds_provider_idx" ON "commerce_refunds" ("provider_refund_reference") WHERE "provider_refund_reference" IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "commerce_disputes" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
      "payment_attempt_id" uuid NOT NULL REFERENCES "payment_attempts"("id") ON DELETE RESTRICT,
      "provider_dispute_reference" varchar NOT NULL UNIQUE,
      "amount_minor" varchar NOT NULL,
      "currency" varchar NOT NULL,
      "state" varchar NOT NULL DEFAULT 'open',
      "reason" varchar,
      "deadline_at" timestamp(3) with time zone,
      "sanitized_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "audit_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "commerce_disputes_site_state_idx" ON "commerce_disputes" ("site_id", "state");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "commerce_disputes";
    DROP TABLE IF EXISTS "commerce_refunds";
    DROP TABLE IF EXISTS "payment_attempts";
    DROP INDEX IF EXISTS "payment_webhook_events_provider_reference_idx";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "last_error";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "attempts";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "processing_state";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "sanitized_evidence";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "provider_reference";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "normalized_kind";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "sequence";
    ALTER TABLE "payment_webhook_events" DROP COLUMN IF EXISTS "occurred_at";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "downstream_instructions";
    DROP INDEX IF EXISTS "orders_checkout_session_unique_idx";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "source_snapshot";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "terms_snapshot";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "totals_snapshot";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "address_snapshot";
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "party_snapshot";
    DROP INDEX IF EXISTS "checkout_sessions_binding_key_idx";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "cancel_path";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "return_path";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "guest_access_token_hash";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "attempt";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "customer_key";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "binding_key";
    ALTER TABLE "checkout_sessions" DROP COLUMN IF EXISTS "proposal_id";
  `)},name:"20260923_030000_shop_04_payment_operations"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "plan_revisions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "plan_key" varchar NOT NULL, "revision" numeric NOT NULL,
      "name" varchar NOT NULL, "lifecycle" varchar NOT NULL DEFAULT 'published', "interval" varchar NOT NULL,
      "interval_count" numeric NOT NULL, "amount_minor" varchar NOT NULL, "currency" varchar(3) NOT NULL,
      "trial_days" numeric NOT NULL DEFAULT 0, "trial_eligibility" varchar NOT NULL, "entitlements" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "cancel_policy" varchar NOT NULL, "change_policy" varchar NOT NULL, "tax_policy" varchar NOT NULL,
      "provider_mappings" jsonb NOT NULL DEFAULT '{}'::jsonb, "published_at" timestamp(3) with time zone NOT NULL,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE, "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL, "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "plan_revisions_key_revision_unique" UNIQUE ("plan_key", "revision")
    );
    CREATE TABLE IF NOT EXISTS "subscriptions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "supporter_id" uuid NOT NULL REFERENCES "supporters"("id") ON DELETE RESTRICT,
      "plan_revision_id" uuid NOT NULL REFERENCES "plan_revisions"("id") ON DELETE RESTRICT, "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "plan_snapshot" jsonb NOT NULL, "provider_key" varchar NOT NULL, "provider_customer_reference" varchar, "provider_subscription_reference" varchar,
      "provider_status" varchar, "state" varchar NOT NULL DEFAULT 'incomplete', "source" varchar NOT NULL,
      "current_period_start" timestamp(3) with time zone NOT NULL, "current_period_end" timestamp(3) with time zone NOT NULL,
      "trial_end" timestamp(3) with time zone, "grace_end" timestamp(3) with time zone, "cancel_at_period_end" boolean NOT NULL DEFAULT false,
      "settings" jsonb NOT NULL DEFAULT '{}'::jsonb, "version" numeric NOT NULL DEFAULT 1, "last_event_sequence" numeric, "last_event_occurred_at" timestamp(3) with time zone, "last_reconciled_at" timestamp(3) with time zone,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL, "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL, "checkout_key" varchar UNIQUE, "failure" jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_ref_idx" ON "subscriptions" ("provider_key", "provider_subscription_reference") WHERE "provider_subscription_reference" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "subscriptions_site_state_period_idx" ON "subscriptions" ("site_id", "state", "current_period_end");
    CREATE TABLE IF NOT EXISTS "subscription_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
      "event_key" varchar NOT NULL, "provider_event_id" varchar, "kind" varchar NOT NULL, "occurred_at" timestamp(3) with time zone NOT NULL,
      "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb, "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL, "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "subscription_events_event_key_unique" UNIQUE ("event_key")
    );
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "resource" varchar;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "capability" varchar;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "scope" varchar;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "grant_key" varchar;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "limit" numeric;
    ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS "entitlements_grant_key_idx" ON "entitlements" ("grant_key") WHERE "grant_key" IS NOT NULL;
    ALTER TABLE "forum_spaces" ADD COLUMN IF NOT EXISTS "required_entitlement" jsonb;
    ALTER TABLE "content" ADD COLUMN IF NOT EXISTS "required_entitlement" jsonb;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "subscription_events"; DROP TABLE IF EXISTS "subscriptions"; DROP TABLE IF EXISTS "plan_revisions";
    DROP INDEX IF EXISTS "entitlements_grant_key_idx";
    ALTER TABLE "entitlements" DROP COLUMN IF EXISTS "evidence", DROP COLUMN IF EXISTS "limit", DROP COLUMN IF EXISTS "grant_key", DROP COLUMN IF EXISTS "scope", DROP COLUMN IF EXISTS "capability", DROP COLUMN IF EXISTS "resource";
    ALTER TABLE "forum_spaces" DROP COLUMN IF EXISTS "required_entitlement";
    ALTER TABLE "content" DROP COLUMN IF EXISTS "required_entitlement";
  `)},name:"20260923_040000_shop_05_subscriptions"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "affiliate_offers" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "slug" varchar NOT NULL,
      "name" varchar NOT NULL,
      "destination_url" varchar NOT NULL,
      "content_id" uuid,
      "product_id" uuid,
      "network_reference" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "disclosure" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "sub_id_template" jsonb,
      "pricing_freshness" jsonb,
      "regions" jsonb DEFAULT '["global"]'::jsonb,
      "status" varchar NOT NULL DEFAULT 'draft',
      "link_health" jsonb DEFAULT '{"status":"healthy","consecutiveFailures":0}'::jsonb,
      "tracking_parameters" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_offers_site_slug_idx" ON "affiliate_offers" ("site_id", "slug");

    CREATE TABLE IF NOT EXISTS "affiliate_clicks" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "offer_id" uuid NOT NULL,
      "click_token" varchar NOT NULL,
      "destination_url" varchar NOT NULL,
      "tracking_allowed" boolean NOT NULL DEFAULT true,
      "bot_detected" boolean NOT NULL DEFAULT false,
      "ip_hash" varchar,
      "user_agent_summary" varchar,
      "referrer" varchar,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "affiliate_clicks_site_token_idx" ON "affiliate_clicks" ("site_id", "click_token");
    CREATE INDEX IF NOT EXISTS "affiliate_clicks_site_offer_idx" ON "affiliate_clicks" ("site_id", "offer_id");

    CREATE TABLE IF NOT EXISTS "affiliate_conversions" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "source" varchar NOT NULL,
      "network" varchar NOT NULL,
      "external_event_id" varchar NOT NULL,
      "external_order_id" varchar,
      "external_transaction_id" varchar,
      "attribution_hint" varchar,
      "amount_minor" varchar NOT NULL,
      "currency" varchar(3) NOT NULL,
      "commission_amount_minor" varchar,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "status" varchar NOT NULL DEFAULT 'pending',
      "raw_payload_hash" varchar NOT NULL,
      "reconciliation_state" varchar NOT NULL DEFAULT 'unmatched',
      "matched_offer_id" uuid,
      "matched_click_id" uuid,
      "reconciliation_notes" text,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "affiliate_conversions_network_event_idx" ON "affiliate_conversions" ("network", "external_event_id");
    CREATE INDEX IF NOT EXISTS "affiliate_conversions_payload_hash_idx" ON "affiliate_conversions" ("raw_payload_hash");

    CREATE TABLE IF NOT EXISTS "referral_programs" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "version" integer NOT NULL DEFAULT 1,
      "name" varchar NOT NULL,
      "status" varchar NOT NULL DEFAULT 'draft',
      "eligibility" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "codes" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "benefit" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "attribution" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "self_referral_rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "hold_period_days" integer NOT NULL DEFAULT 14,
      "reversal_rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "terms" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "referral_programs_site_version_idx" ON "referral_programs" ("site_id", "version");

    CREATE TABLE IF NOT EXISTS "commission_ledgers" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "program_id" uuid NOT NULL,
      "program_version" integer NOT NULL,
      "referrer_member_id" varchar NOT NULL,
      "order_id" uuid NOT NULL,
      "order_number" varchar NOT NULL,
      "payment_intent_id" uuid,
      "currency" varchar(3) NOT NULL,
      "amount_minor" varchar NOT NULL,
      "type" varchar NOT NULL DEFAULT 'accrual',
      "status" varchar NOT NULL DEFAULT 'pending',
      "mature_at" timestamp(3) with time zone NOT NULL,
      "settled_at" timestamp(3) with time zone,
      "reversed_at" timestamp(3) with time zone,
      "reversal_reason" varchar,
      "fraud_flag" varchar,
      "settlement_batch_id" uuid,
      "explanation" text NOT NULL,
      "compensates_ledger_id" uuid,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "commission_ledgers_site_member_idx" ON "commission_ledgers" ("site_id", "referrer_member_id");
    CREATE INDEX IF NOT EXISTS "commission_ledgers_site_curr_status_idx" ON "commission_ledgers" ("site_id", "currency", "status");

    CREATE TABLE IF NOT EXISTS "settlement_batches" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "batch_number" varchar NOT NULL,
      "currency" varchar(3) NOT NULL,
      "total_amount_minor" varchar NOT NULL,
      "entries_count" integer NOT NULL DEFAULT 0,
      "status" varchar NOT NULL DEFAULT 'draft',
      "approved_by" varchar,
      "approved_at" timestamp(3) with time zone,
      "export_payload_hash" varchar,
      "external_reference" varchar,
      "failure_reason" text,
      "reconciled_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "settlement_batches_site_batch_idx" ON "settlement_batches" ("site_id", "batch_number");

    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "referral_attribution" jsonb;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "orders" DROP COLUMN IF EXISTS "referral_attribution";
    DROP TABLE IF EXISTS "settlement_batches" CASCADE;
    DROP TABLE IF EXISTS "commission_ledgers" CASCADE;
    DROP TABLE IF EXISTS "referral_programs" CASCADE;
    DROP TABLE IF EXISTS "affiliate_conversions" CASCADE;
    DROP TABLE IF EXISTS "affiliate_clicks" CASCADE;
    DROP TABLE IF EXISTS "affiliate_offers" CASCADE;
  `)},name:"20260923_050000_shop_06_affiliate_and_referrals"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "donation_campaigns" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "campaign_key" varchar NOT NULL, "version" numeric NOT NULL,
      "title" varchar NOT NULL, "story" jsonb, "media" jsonb NOT NULL DEFAULT '[]'::jsonb, "purpose" varchar NOT NULL,
      "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
      "designations" jsonb NOT NULL DEFAULT '[]'::jsonb, "starts_at" timestamptz, "ends_at" timestamptz,
      "goal_amount_minor" varchar, "goal_rules" jsonb NOT NULL DEFAULT '{}'::jsonb, "allowed_amounts" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "currency" varchar(3) NOT NULL, "recurrence" jsonb NOT NULL DEFAULT '["one-time"]'::jsonb, "fee_cover" jsonb,
      "privacy_default" varchar NOT NULL DEFAULT 'private', "disclosures" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "lifecycle" varchar NOT NULL DEFAULT 'draft', "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL, "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "donation_campaigns_site_key_version_unique" UNIQUE ("site_id", "campaign_key", "version"),
      CONSTRAINT "donation_campaigns_dates_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"),
      CONSTRAINT "donation_campaigns_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
    );
    CREATE INDEX IF NOT EXISTS "donation_campaigns_site_lifecycle_idx" ON "donation_campaigns" ("site_id", "lifecycle");
    CREATE TABLE IF NOT EXISTS "donation_intents" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "campaign_id" uuid NOT NULL REFERENCES "donation_campaigns"("id") ON DELETE RESTRICT,
      "campaign_version" numeric NOT NULL, "designation" varchar, "donor_snapshot" jsonb NOT NULL, "money_snapshot" jsonb NOT NULL,
      "recognition" varchar NOT NULL, "public_display_name" varchar, "donor_message" varchar, "tracking_source" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "payment_intent_id" uuid REFERENCES "payment_intents"("id") ON DELETE RESTRICT, "subscription_id" uuid REFERENCES "subscriptions"("id") ON DELETE RESTRICT,
      "recurrence" varchar NOT NULL DEFAULT 'one-time', "lifecycle" varchar NOT NULL DEFAULT 'created',
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE, "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL, "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "donation_intents_payment_unique" UNIQUE ("payment_intent_id"),
      CONSTRAINT "donation_intents_recognition_check" CHECK ("recognition" IN ('public','anonymous','private')),
      CONSTRAINT "donation_intents_recurrence_check" CHECK ("recurrence" IN ('one-time','recurring'))
    );
    CREATE INDEX IF NOT EXISTS "donation_intents_campaign_lifecycle_idx" ON "donation_intents" ("campaign_id", "lifecycle");
    CREATE TABLE IF NOT EXISTS "donations" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "donation_intent_id" uuid NOT NULL UNIQUE REFERENCES "donation_intents"("id") ON DELETE RESTRICT,
      "campaign_id" uuid NOT NULL REFERENCES "donation_campaigns"("id") ON DELETE RESTRICT, "payment_intent_id" uuid NOT NULL UNIQUE REFERENCES "payment_intents"("id") ON DELETE RESTRICT,
      "subscription_id" uuid REFERENCES "subscriptions"("id") ON DELETE RESTRICT, "donor_snapshot" jsonb NOT NULL, "campaign_snapshot" jsonb NOT NULL,
      "designation" varchar, "base_amount_minor" varchar NOT NULL, "fee_covered_amount_minor" varchar NOT NULL DEFAULT '0', "currency" varchar(3) NOT NULL,
      "recognition" varchar NOT NULL, "public_display_name" varchar, "donor_message" varchar, "tracking_source" jsonb NOT NULL DEFAULT '{}',
      "lifecycle" varchar NOT NULL DEFAULT 'succeeded',
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE, "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL, "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "donations_money_check" CHECK ("base_amount_minor" ~ '^[0-9]+$' AND "fee_covered_amount_minor" ~ '^[0-9]+$' AND "currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "donations_recognition_check" CHECK ("recognition" IN ('public','anonymous','private'))
    );
    CREATE INDEX IF NOT EXISTS "donations_site_created_idx" ON "donations" ("site_id", "created_at");
    CREATE TABLE IF NOT EXISTS "donation_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(), "donation_id" uuid REFERENCES "donations"("id") ON DELETE RESTRICT,
      "donation_intent_id" uuid REFERENCES "donation_intents"("id") ON DELETE RESTRICT,
      "event_key" varchar NOT NULL UNIQUE, "kind" varchar NOT NULL, "occurred_at" timestamptz NOT NULL, "actor" varchar,
      "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "donation_events_exactly_one_target_check" CHECK (("donation_id" IS NOT NULL) <> ("donation_intent_id" IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS "donation_events_donation_occurred_idx" ON "donation_events" ("donation_id", "occurred_at");
  `)},down:async function a({db:b}){await b.execute(aa.sql`DROP TABLE IF EXISTS "donation_events"; DROP TABLE IF EXISTS "donations"; DROP TABLE IF EXISTS "donation_intents"; DROP TABLE IF EXISTS "donation_campaigns";`)},name:"20260923_060000_shop_07_donations"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "receipt_entity_name" varchar;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "verified_nonprofit_status" boolean NOT NULL DEFAULT false;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "verified501c3_status" boolean NOT NULL DEFAULT false;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "verified_tax_deductibility" boolean NOT NULL DEFAULT false;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "tax_disclaimer" varchar;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "donor_wall_minimum_minor" varchar NOT NULL DEFAULT '0';
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "supporter_entitlement" varchar;
    ALTER TABLE "donation_campaigns" ADD COLUMN IF NOT EXISTS "supporter_entitlement_term_days" numeric;
    ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "receipt_snapshot" jsonb;
    ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "supporter_id" uuid REFERENCES "supporters"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "donations_supporter_idx" ON "donations" ("supporter_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP INDEX IF EXISTS "donations_supporter_idx";
    ALTER TABLE "donations" DROP COLUMN IF EXISTS "supporter_id", DROP COLUMN IF EXISTS "receipt_snapshot";
    ALTER TABLE "donation_campaigns" DROP COLUMN IF EXISTS "supporter_entitlement_term_days", DROP COLUMN IF EXISTS "supporter_entitlement", DROP COLUMN IF EXISTS "donor_wall_minimum_minor", DROP COLUMN IF EXISTS "tax_disclaimer", DROP COLUMN IF EXISTS "verified_tax_deductibility", DROP COLUMN IF EXISTS "verified501c3_status", DROP COLUMN IF EXISTS "verified_nonprofit_status", DROP COLUMN IF EXISTS "receipt_entity_name";
  `)},name:"20260923_070000_shop_07_donation_lifecycle"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "pod_connections" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      "provider_key" varchar(64) NOT NULL,
      "label" varchar(120) NOT NULL,
      "remote_store_id" varchar(120),
      "remote_store_name" varchar(160),
      "encrypted_api_key" text NOT NULL,
      "encrypted_webhook_secret" text,
      "status" varchar(32) NOT NULL DEFAULT 'active',
      "capabilities" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "last_health_checked_at" timestamp(3) with time zone,
      "last_health_status" varchar(32),
      "last_health_reason" text,
      "disabled_reason" text,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "pod_connections_site_idx" ON "pod_connections" ("site_id");
    CREATE INDEX IF NOT EXISTS "pod_connections_provider_idx" ON "pod_connections" ("provider_key");

    CREATE TABLE IF NOT EXISTS "pod_jobs" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "connection_id" uuid REFERENCES "pod_connections"("id") ON DELETE SET NULL,
      "provider_key" varchar(64) NOT NULL,
      "package_index" numeric NOT NULL DEFAULT 0,
      "idempotency_key" varchar(200) NOT NULL,
      "payload_hash" varchar(64) NOT NULL,
      "state" varchar(32) NOT NULL DEFAULT 'created',
      "address_policy" varchar(32) NOT NULL DEFAULT 'domestic',
      "recipient_snapshot" jsonb NOT NULL,
      "items_snapshot" jsonb NOT NULL,
      "cost_snapshot" jsonb NOT NULL,
      "attempt_count" numeric NOT NULL DEFAULT 0,
      "external_order_id" varchar(160),
      "hold_expires_at" timestamp(3) with time zone,
      "released_at" timestamp(3) with time zone,
      "audit_trail" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "last_error" text,
      "parent_job_id" uuid REFERENCES "pod_jobs"("id") ON DELETE SET NULL,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "pod_jobs_idempotency_unique" UNIQUE ("idempotency_key")
    );
    CREATE INDEX IF NOT EXISTS "pod_jobs_order_idx" ON "pod_jobs" ("order_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_site_idx" ON "pod_jobs" ("site_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_external_order_idx" ON "pod_jobs" ("external_order_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_state_idx" ON "pod_jobs" ("state");

    CREATE TABLE IF NOT EXISTS "pod_job_events" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "job_id" uuid NOT NULL REFERENCES "pod_jobs"("id") ON DELETE CASCADE,
      "provider_key" varchar(64) NOT NULL,
      "provider_event_id" varchar(160) NOT NULL,
      "kind" varchar(64) NOT NULL,
      "occurred_at" timestamp(3) with time zone NOT NULL,
      "fulfillments" jsonb,
      "tracking" jsonb,
      "raw_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "pod_job_events_provider_unique" UNIQUE ("provider_key", "provider_event_id")
    );
    CREATE INDEX IF NOT EXISTS "pod_job_events_job_idx" ON "pod_job_events" ("job_id");

    CREATE TABLE IF NOT EXISTS "manual_fulfillment_packages" (
      "id" uuid PRIMARY KEY DEFAULT "renegade_uuid_v7"(),
      "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
      "package_index" numeric NOT NULL DEFAULT 0,
      "source" varchar(64) NOT NULL,
      "status" varchar(32) NOT NULL DEFAULT 'pending_acknowledgement',
      "approved_lines" jsonb NOT NULL,
      "permissioned_address_manifest" jsonb NOT NULL,
      "instructions" text,
      "acknowledgement" jsonb,
      "external_fulfillment" jsonb,
      "audit_trail" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_order_idx" ON "manual_fulfillment_packages" ("order_id");
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_site_idx" ON "manual_fulfillment_packages" ("site_id");
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_status_idx" ON "manual_fulfillment_packages" ("status");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "manual_fulfillment_packages";
    DROP TABLE IF EXISTS "pod_job_events";
    DROP TABLE IF EXISTS "pod_jobs";
    DROP TABLE IF EXISTS "pod_connections";
  `)},name:"20260923_080000_shop_03_pod_and_fulfillment"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "required_entitlement" jsonb;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "events" DROP COLUMN IF EXISTS "required_entitlement";
  `)},name:"20260923_090000_events_required_entitlement"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "scheduled_publish_jobs"
      ADD COLUMN IF NOT EXISTS "lease_owner" varchar,
      ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "retry_count" numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "max_retries" numeric NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS "last_error" varchar;
    ALTER TYPE "enum_scheduled_publish_jobs_status" ADD VALUE IF NOT EXISTS 'processing';
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM "scheduled_publish_jobs"
        WHERE "status" = 'processing'
          OR "lease_owner" IS NOT NULL OR "lease_expires_at" IS NOT NULL
          OR "retry_count" <> 0 OR "max_retries" <> 3 OR "last_error" IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Cannot roll back active schedule leases or retry evidence.';
      END IF;
    END $$;
    ALTER TABLE "scheduled_publish_jobs"
      DROP COLUMN IF EXISTS "lease_owner",
      DROP COLUMN IF EXISTS "lease_expires_at",
      DROP COLUMN IF EXISTS "retry_count",
      DROP COLUMN IF EXISTS "max_retries",
      DROP COLUMN IF EXISTS "last_error";
  `)},name:"20260923_100000_flow_03_scheduler_runtime"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "content_releases"
      ADD COLUMN IF NOT EXISTS "name" varchar,
      ADD COLUMN IF NOT EXISTS "purpose" varchar,
      ADD COLUMN IF NOT EXISTS "owner_team" varchar,
      ADD COLUMN IF NOT EXISTS "planned_instant" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "labels" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "campaign" varchar,
      ADD COLUMN IF NOT EXISTS "dependencies" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "release_revision" numeric DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "artifacts" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "gate_snapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "approvals" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "saga_steps" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "resulting_urls" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "lease_owner" varchar,
      ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp(3) with time zone;
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'in-review';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'completed';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'partially-failed';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'failed';
    ALTER TYPE "enum_content_releases_status" ADD VALUE IF NOT EXISTS 'rolled-back';
    CREATE INDEX IF NOT EXISTS "content_releases_planned_instant_idx"
      ON "content_releases" ("planned_instant");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM "content_releases"
        WHERE "status" IN ('in-review', 'approved', 'completed', 'partially-failed', 'failed', 'rolled-back')
          OR "name" IS NOT NULL OR "purpose" IS NOT NULL OR "owner_team" IS NOT NULL
          OR "planned_instant" IS NOT NULL OR "campaign" IS NOT NULL
          OR "gate_snapshot" IS NOT NULL OR "lease_owner" IS NOT NULL
          OR "lease_expires_at" IS NOT NULL
          OR COALESCE("labels", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("dependencies", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("release_revision", 1) <> 1
          OR COALESCE("artifacts", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("approvals", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("saga_steps", '[]'::jsonb) <> '[]'::jsonb
          OR COALESCE("resulting_urls", '[]'::jsonb) <> '[]'::jsonb
      ) THEN
        RAISE EXCEPTION 'Cannot roll back release lifecycle or snapshot evidence.';
      END IF;
    END $$;
    DROP INDEX IF EXISTS "content_releases_planned_instant_idx";
    ALTER TABLE "content_releases"
      DROP COLUMN IF EXISTS "name",
      DROP COLUMN IF EXISTS "purpose",
      DROP COLUMN IF EXISTS "owner_team",
      DROP COLUMN IF EXISTS "planned_instant",
      DROP COLUMN IF EXISTS "labels",
      DROP COLUMN IF EXISTS "campaign",
      DROP COLUMN IF EXISTS "dependencies",
      DROP COLUMN IF EXISTS "release_revision",
      DROP COLUMN IF EXISTS "artifacts",
      DROP COLUMN IF EXISTS "gate_snapshot",
      DROP COLUMN IF EXISTS "approvals",
      DROP COLUMN IF EXISTS "saga_steps",
      DROP COLUMN IF EXISTS "resulting_urls",
      DROP COLUMN IF EXISTS "lease_owner",
      DROP COLUMN IF EXISTS "lease_expires_at";
  `)},name:"20260923_110000_content_release_runtime"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "email_templates"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "email_templates_publication_id_idx" ON "email_templates" ("publication_id");
    CREATE INDEX IF NOT EXISTS "email_templates_space_id_idx" ON "email_templates" ("space_id");
    CREATE INDEX IF NOT EXISTS "email_templates_owner_id_idx" ON "email_templates" ("owner_id");

    ALTER TABLE "audience_experiments"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "audience_experiments_publication_id_idx" ON "audience_experiments" ("publication_id");
    CREATE INDEX IF NOT EXISTS "audience_experiments_space_id_idx" ON "audience_experiments" ("space_id");
    CREATE INDEX IF NOT EXISTS "audience_experiments_owner_id_idx" ON "audience_experiments" ("owner_id");

    ALTER TABLE "promotions"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "promotions_publication_id_idx" ON "promotions" ("publication_id");
    CREATE INDEX IF NOT EXISTS "promotions_owner_id_idx" ON "promotions" ("owner_id");

    ALTER TABLE "checkout_proposals"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "checkout_proposals_publication_id_idx" ON "checkout_proposals" ("publication_id");
    CREATE INDEX IF NOT EXISTS "checkout_proposals_owner_id_idx" ON "checkout_proposals" ("owner_id");

    ALTER TABLE "inventory_reservations"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "inventory_reservations_publication_id_idx" ON "inventory_reservations" ("publication_id");
    CREATE INDEX IF NOT EXISTS "inventory_reservations_owner_id_idx" ON "inventory_reservations" ("owner_id");

    ALTER TABLE "pod_connections"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "pod_connections_publication_id_idx" ON "pod_connections" ("publication_id");
    CREATE INDEX IF NOT EXISTS "pod_connections_owner_id_idx" ON "pod_connections" ("owner_id");

    ALTER TABLE "pod_jobs"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "pod_jobs_publication_id_idx" ON "pod_jobs" ("publication_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_space_id_idx" ON "pod_jobs" ("space_id");
    CREATE INDEX IF NOT EXISTS "pod_jobs_owner_id_idx" ON "pod_jobs" ("owner_id");

    ALTER TABLE "manual_fulfillment_packages"
      ADD COLUMN IF NOT EXISTS "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "space_id" uuid REFERENCES "spaces"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "members"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_publication_id_idx" ON "manual_fulfillment_packages" ("publication_id");
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_space_id_idx" ON "manual_fulfillment_packages" ("space_id");
    CREATE INDEX IF NOT EXISTS "manual_fulfillment_packages_owner_id_idx" ON "manual_fulfillment_packages" ("owner_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "manual_fulfillment_packages"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "space_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "pod_jobs"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "space_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "pod_connections"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "inventory_reservations"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "checkout_proposals"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "promotions"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "audience_experiments"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "space_id",
      DROP COLUMN IF EXISTS "owner_id";

    ALTER TABLE "email_templates"
      DROP COLUMN IF EXISTS "publication_id",
      DROP COLUMN IF EXISTS "space_id",
      DROP COLUMN IF EXISTS "owner_id";
  `)},name:"20260924_000000_collection_scope_columns"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "donation_intents" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar;
    CREATE UNIQUE INDEX IF NOT EXISTS "donation_intents_idempotency_key_idx"
      ON "donation_intents" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP INDEX IF EXISTS "donation_intents_idempotency_key_idx";
    ALTER TABLE "donation_intents" DROP COLUMN IF EXISTS "idempotency_key";
  `)},name:"20260924_010000_donation_checkout_idempotency"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'commerce-process-payment-event';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'commerce-reconcile-payments';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'commerce-reconcile-subscriptions';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'commerce-process-payment-event';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'commerce-reconcile-payments';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'commerce-reconcile-subscriptions';
  `)},down:async function a({}){},name:"20260924_020000_commerce_job_enum"},{up:async function a({db:b}){await b.execute(aa.sql`
    CREATE TABLE IF NOT EXISTS "ai_connections" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "publication_id" uuid REFERENCES "publications"("id") ON DELETE SET NULL,
      "label" varchar NOT NULL,
      "provider_key" varchar NOT NULL,
      "endpoint" varchar NOT NULL,
      "model" varchar NOT NULL,
      "models" jsonb NOT NULL,
      "capabilities" jsonb NOT NULL,
      "allowed_tasks" jsonb NOT NULL,
      "status" varchar NOT NULL,
      "last_error" varchar,
      "last_tested_at" timestamptz,
      "per_task_usd" numeric NOT NULL,
      "monthly_usd" numeric NOT NULL,
      "max_input_tokens" numeric NOT NULL,
      "max_output_tokens" numeric NOT NULL,
      "input_usd_per1k" numeric NOT NULL,
      "output_usd_per1k" numeric NOT NULL,
      "created_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "ai_connections_site_idx" ON "ai_connections"("site_id");
    CREATE INDEX IF NOT EXISTS "ai_connections_publication_idx" ON "ai_connections"("publication_id");
    CREATE INDEX IF NOT EXISTS "ai_connections_updated_at_idx" ON "ai_connections"("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_connections_created_at_idx" ON "ai_connections"("created_at");

    CREATE TABLE IF NOT EXISTS "ai_credentials" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "connection_id" uuid NOT NULL UNIQUE REFERENCES "ai_connections"("id") ON DELETE CASCADE,
      "envelope" jsonb NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "ai_credentials_updated_at_idx" ON "ai_credentials"("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_credentials_created_at_idx" ON "ai_credentials"("created_at");

    CREATE TABLE IF NOT EXISTS "ai_proposals" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
      "connection_id" uuid REFERENCES "ai_connections"("id") ON DELETE SET NULL,
      "task" varchar NOT NULL,
      "target_collection" varchar NOT NULL,
      "target_id" varchar NOT NULL,
      "target_updated_at" timestamptz NOT NULL,
      "status" varchar NOT NULL,
      "original" jsonb,
      "output" jsonb,
      "context_preview" jsonb NOT NULL,
      "usage" jsonb,
      "audit_id" varchar NOT NULL,
      "requested_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "decided_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "decided_at" timestamptz,
      "failure_code" varchar,
      "application" jsonb,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "ai_proposals_site_idx" ON "ai_proposals"("site_id");
    CREATE INDEX IF NOT EXISTS "ai_proposals_connection_idx" ON "ai_proposals"("connection_id");
    CREATE INDEX IF NOT EXISTS "ai_proposals_target_id_idx" ON "ai_proposals"("target_id");
    CREATE INDEX IF NOT EXISTS "ai_proposals_updated_at_idx" ON "ai_proposals"("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_proposals_created_at_idx" ON "ai_proposals"("created_at");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    DROP TABLE IF EXISTS "ai_proposals";
    DROP TABLE IF EXISTS "ai_credentials";
    DROP TABLE IF EXISTS "ai_connections";
  `)},name:"20260924_030000_ai_proposals"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "ai_connections_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_ai_connections_id_idx" ON "payload_locked_documents_rels" ("ai_connections_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "ai_credentials_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_ai_credentials_id_idx" ON "payload_locked_documents_rels" ("ai_credentials_id");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "ai_proposals_id" uuid;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_ai_proposals_id_idx" ON "payload_locked_documents_rels" ("ai_proposals_id");
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "ai_connections_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "ai_credentials_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "ai_proposals_id";
  `)},name:"20260924_040000_ai_locked_documents_rels"},{up:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "ai_connections"
      ADD COLUMN IF NOT EXISTS "budget_month" varchar,
      ADD COLUMN IF NOT EXISTS "spent_month_usd" numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "lease_until" timestamptz,
      ADD COLUMN IF NOT EXISTS "lease_id" varchar,
      ADD COLUMN IF NOT EXISTS "leased_cost_usd" numeric NOT NULL DEFAULT 0;
  `)},down:async function a({db:b}){await b.execute(aa.sql`
    ALTER TABLE "ai_connections"
      DROP COLUMN IF EXISTS "budget_month",
      DROP COLUMN IF EXISTS "spent_month_usd",
      DROP COLUMN IF EXISTS "lease_until",
      DROP COLUMN IF EXISTS "lease_id",
      DROP COLUMN IF EXISTS "leased_cost_usd";
  `)},name:"20260924_050000_ai_budget_reservation"}];var ad=a.i(912714);a.i(666680);var ae=a.i(750227);async function af(a){try{return JSON.parse(await (0,ad.readFile)(ae.default.join(a,".renegade","backup-status.json"),"utf8"))}catch{return null}}var ag=a.i(999613),ah=a.i(813220),ai=a.i(704084);let aj=a=>a.docs??[],ak=a=>"string"!=typeof a||Number.isNaN(Date.parse(a))?null:a;function al(a){var b;let c,d=[...a.log??[]].reverse().find(a=>"failed"===a.state);return{id:a.id,taskName:a.taskSlug??"unknown",timestamps:{createdAt:ak(a.createdAt),updatedAt:ak(a.updatedAt),completedAt:ak(a.completedAt)},attemptCount:a.totalTried??0,error:d?.error||a.error?(b=d?.error??a.error,("string"==typeof(c=(0,ah.redact)(b,(0,ah.configuredSecretValues)()))?c:JSON.stringify(c)).slice(0,500)):null,correlation:{jobId:a.id,queue:a.queue??null,idempotencyKey:a.concurrencyKey??null}}}async function am(a,b,c={}){let d=c.now?.()??new Date,e=c.expectedMigrations??[];try{let f,[g,h,i,j,k,l,m,n,o,p]=await Promise.all([(0,ag.getMigrations)({payload:a}),a.find({collection:"payload-jobs",where:{taskSlug:{equals:"operations-heartbeat"}},sort:"-completedAt",limit:1,depth:0}),a.find({collection:"payload-jobs",limit:250,depth:0,sort:"createdAt"}),a.find({collection:"payload-jobs",where:{hasError:{equals:!0}},sort:"-updatedAt",limit:25,depth:0}),a.find({collection:"social-accounts",limit:100,depth:0}),a.find({collection:"quality-scans",sort:"-completedAt",limit:1,depth:0}),a.find({collection:"quality-issues",where:{status:{in:["open","uncertain"]}},limit:1,depth:0}),a.find({collection:"merchant-connections",limit:100,depth:0}),a.find({collection:"experiments",limit:100,depth:0}),a.find({collection:"experiment-variants",limit:500,depth:0})]),q=new Set(g.existingMigrations.map(a=>a.name)),r=e.filter(a=>!q.has(a)),s=aj(i),t=aj(j),u=s.filter(a=>!a.completedAt&&!a.hasError),v=aj(h)[0],w=ak(v?.completedAt)??ak(v?.updatedAt),x=w?d.getTime()-Date.parse(w):null,y=null!==x&&x<=Number(process.env.WORKER_HEARTBEAT_MAX_AGE_MS??45e3),z=[...aj(k),...aj(n)].map(a=>({id:a.id,label:a.label??a.id,providerKey:a.providerKey??`social.${a.label??"account"}`,status:["degraded","disabled","expired","invalid","revoked","not-configured"].includes(a.status??a.credentialHealth??"")?"degraded":"healthy",observedAt:ak(a.lastVerifiedAt)??ak(a.updatedAt)})),A=aj(o),B=aj(p),C=A.filter(a=>"running"===a.state),D=C.filter(a=>!B.filter(b=>("string"==typeof b.experiment?b.experiment:b.experiment?.id)===a.id).some(a=>a.isControl&&a.registeredComponent)),E={status:D.length?"degraded":"healthy",running:C.length,invalid:D.length},F=await (0,ai.selectEmailDeliveryAdapter)(b).health();try{await (c.checkMediaStorage??(()=>(0,ad.access)(b.storage.mediaDir,ad.constants.W_OK)))(),f={status:"healthy",driver:b.storage.driver}}catch{f={status:"unavailable",driver:b.storage.driver}}let G=aj(l)[0],H={lastScanAt:ak(G?.completedAt),lastScanStatus:G?.status??null,openIssues:Number(m.totalDocs??0)},I=new $({profile:"Standard",coreVersion:b.version,schemaVersion:"1.0.0",evidence:{"experiences.experiments":{health:E.status}},workers:Object.fromEntries(["media.processing","social.distribution","quality.scanning"].map(a=>[a,y?"healthy":"unavailable"]))}).read(d.toISOString()),J=!y||r.length>0||"unavailable"===f.status||"degraded"===F.status||z.some(a=>"degraded"===a.status)||"degraded"===E.status;return{generatedAt:d.toISOString(),status:J?"degraded":"healthy",version:{app:b.version,buildSha:b.buildSha??null,schemaVersion:b.schemaVersion,deploymentProfile:b.deploymentProfile},database:{status:"healthy"},migrations:{status:r.length?"behind":"current",applied:q.size,expected:e.length,missing:r},web:{status:"healthy",observedAt:d.toISOString()},worker:{status:y?"healthy":"unavailable",observedAt:w,ageMs:x},jobs:{queued:u.filter(a=>!a.processing).length,running:u.filter(a=>a.processing).length,failed:t.length,oldestPendingAt:u[0]?ak(u[0].createdAt):null,recentFailures:t.slice(0,25).map(al)},capabilities:I,quality:H,providers:z,email:F,mediaStorage:f,backup:function(a){if(!a||"object"!=typeof a)return{status:"not_configured",lastSuccessfulAt:null,lastFailureAt:null};let b=a.status,c=ak(a.lastSuccessfulAt);return{status:"healthy"===b||"failed"===b?b:"not_configured",lastSuccessfulAt:c,lastFailureAt:ak(a.lastFailureAt)}}(await af(b.storage.mediaDir))}}catch{return{generatedAt:d.toISOString(),status:"unhealthy_core",version:{app:b.version,buildSha:b.buildSha??null,schemaVersion:b.schemaVersion,deploymentProfile:b.deploymentProfile},database:{status:"unavailable"},migrations:{status:"unavailable",applied:0,expected:e.length,missing:[...e]},web:{status:"healthy",observedAt:d.toISOString()},worker:{status:"unavailable",observedAt:null,ageMs:null},jobs:{queued:0,running:0,failed:0,oldestPendingAt:null,recentFailures:[]},capabilities:[],providers:[],email:{provider:b.email.mode,status:"disabled"===b.email.mode?"disabled":"degraded"},mediaStorage:{status:"unavailable",driver:b.storage.driver},backup:{status:"not_configured",lastSuccessfulAt:null,lastFailureAt:null},quality:{lastScanAt:null,lastScanStatus:null,openIssues:0}}}}var an=a.i(154376);let ao={"core.publishing":{label:"Core publishing",href:"/admin/collections/content",description:"Local public reading and publishing foundations."},"editorial.workflow":{label:"Editorial workflow",href:"/admin/collections/content",description:"Draft, review, revision, and release workflow."},"media.processing":{label:"Advanced media",href:"/admin/collections/media-derivatives",description:"Derivatives, DAM workflow, and processing."},"social.distribution":{label:"Social scheduling",href:"/admin/collections/social-accounts",description:"Connected accounts, drafts, and publishing queue."},"audience.transactional-email":{label:"Audience delivery",href:"/admin/collections/subscribers",description:"Subscribers and email delivery operations."},"commerce.checkout":{label:"Commerce & POS",href:"/admin/collections/products",description:"Products, payments, orders, and point of sale."},"analytics.reporting":{label:"Advanced analytics",href:"/admin/collections/analytics-rollups",description:"Analytics rollups, goals, and reports."},"experiences.experiments":{label:"Experiments",href:"/admin/collections/experiments",description:"Controlled experiences and analysis."},"quality.scanning":{label:"Quality Center",href:"/admin/collections/quality-scans",description:"Policies, scans, issues, and waivers."},"networking.federation":{label:"Optional network",href:"/admin/collections/network-relationships",description:"Remote discovery, relationships, moderation, inboxes, and delivery diagnostics."}},ap=a=>"healthy"===a?"success":"degraded"===a?"warning":"neutral";async function aq({initPageResult:a}){let b,c=a.req;if(b=c.user,b?.role!=="owner")return(0,e.jsxs)("main",{className:"gutter--left gutter--right",children:[(0,e.jsx)("h1",{children:"Capability Center"}),(0,e.jsx)("p",{children:"Owner access is required."})]});let d=(0,_.loadConfig)(),f=await am(c.payload,d,{expectedMigrations:ac.map(a=>a.name)}),g=await c.payload.findGlobal({slug:"site-settings",req:c,depth:0}),h=g.adminExperience?.optionalCapabilities,i={"media.processing":h?.mediaProcessing??!1,"social.distribution":h?.socialDistribution??!1,"audience.transactional-email":h?.transactionalEmail??!1,"commerce.checkout":h?.commerceCheckout??!1,"analytics.reporting":h?.analyticsReporting??!1,"experiences.experiments":h?.experiments??!1,"quality.scanning":h?.qualityScanning??!1,"networking.federation":d.networking.enabled},j=new $({profile:"Standard",coreVersion:d.version,schemaVersion:"1.0.0",evidence:Object.fromEntries(f.capabilities.map(a=>[a.key,{enabled:i[a.key]??a.required}])),workers:Object.fromEntries(f.capabilities.filter(a=>a.reason?.code==="worker_unavailable").map(a=>[a.key,"unavailable"]))}).read();return(0,e.jsxs)("main",{className:"gutter--left gutter--right",style:{maxWidth:1180,margin:"0 auto"},children:[(0,e.jsx)("h1",{children:"Capability Center"}),(0,e.jsx)(T.default,{}),(0,e.jsx)("p",{children:"Core publishing stays focused. Optional systems remain installed and can be enabled here without removing their records."}),(0,e.jsxs)("p",{children:[(0,e.jsx)(R.default,{href:"/admin/globals/site-settings",children:"Configure optional capabilities"})," ·"," ",(0,e.jsx)(R.default,{href:"#operational-overview",children:"Operational overview"})]}),(0,e.jsxs)("section",{style:{marginTop:28},children:[(0,e.jsx)("h2",{children:"Runtime identity"}),(0,e.jsxs)("p",{children:["Application ",f.version.app," · Schema"," ",f.version.schemaVersion??"unknown"," · Build"," ",f.version.buildSha??"not supplied"," · Profile"," ",f.version.deploymentProfile??"unknown"]}),(0,e.jsxs)("p",{children:["Migrations: ",f.migrations.status," (",f.migrations.applied,"/",f.migrations.expected,") · Worker: ",f.worker.status]})]}),(0,e.jsxs)("section",{style:{marginTop:28},children:[(0,e.jsx)("h2",{children:"Capability readiness"}),(0,e.jsx)("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))",gap:16},children:j.filter(a=>!a.required).map(a=>{let b=ao[a.key];if(!b)return null;let c=(0,an.capabilityPresentationState)(a);return(0,e.jsxs)("article",{className:"card",style:{padding:16},children:[(0,e.jsx)("h3",{children:b.label}),(0,e.jsx)("p",{children:b.description}),(0,e.jsxs)("p",{children:[a.requiresExternalProvider?"External provider required. ":"",a.requiresWorker?"Worker-backed. ":""]}),(0,e.jsx)("p",{children:(0,e.jsx)("strong",{className:`status ${ap(c)}`,children:c})}),(0,e.jsx)("p",{children:"disabled"===c?(0,e.jsx)(R.default,{href:"/admin/globals/site-settings",children:"Enable or configure"}):(0,e.jsxs)(R.default,{href:b.href,children:["Open ",b.label]})}),a.reason?(0,e.jsx)("small",{children:a.reason.detail}):null]},a.key)})})]}),(0,e.jsxs)("section",{style:{marginTop:32},children:[(0,e.jsx)("h2",{children:"Further optional tools"}),(0,e.jsx)("p",{children:"These remain available to authorized operators and are intentionally outside everyday publishing navigation."}),(0,e.jsxs)("p",{children:[(0,e.jsx)(R.default,{href:"/admin/collections/content-releases",children:"Coordinated releases"})," ·"," ",(0,e.jsx)(R.default,{href:"/admin/collections/calendar-entries",children:"Calendar operations"})," ·"," ",(0,e.jsx)(R.default,{href:"/admin/collections/members",children:"Enterprise identity & federation"})," ·"," ",(0,e.jsx)(R.default,{href:"/connections",children:"Connections, AI & providers"})]})]}),(0,e.jsxs)("section",{style:{marginTop:32},id:"operational-overview",children:[(0,e.jsx)("h2",{children:"Operational overview"}),(0,e.jsx)("p",{children:"Safe status only; credentials and provider secrets are never displayed."}),(0,e.jsx)("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:12},children:(0,an.operationalOverview)(f).map(([a,b])=>(0,e.jsxs)("div",{className:"card",style:{padding:14},children:[(0,e.jsx)("strong",{children:a}),(0,e.jsx)("br",{}),(0,e.jsx)("span",{className:`status ${ap(b)}`,children:b})]},a))})]})]})}var ar=a.i(679013);async function as({initPageResult:a,params:b}){let c=b?.segments?.[0],d="pages"===c?"page":"podcasts"===c?"podcast":"article",f="page"===d?"Pages":"podcast"===d?"Podcasts":"Posts",g="page"===d?"Page":"podcast"===d?"Podcast":"Post",h=await a.req.payload.find({collection:"content",where:{contentType:{equals:d}},depth:0,limit:50,req:a.req});return(0,e.jsxs)("main",{className:"gutter--left gutter--right",children:[(0,e.jsx)("h1",{children:f}),(0,e.jsx)("p",{children:"page"===d?"Create durable site pages with a hierarchy and template intent.":"podcast"===d?"Publish podcast shows and episodes integrated with the canonical workflow system.":"Write and prepare publication posts with authors, taxonomy, media, and a release date."}),(0,e.jsx)("p",{children:"podcast"===d?(0,e.jsxs)("span",{className:"space-x-3",children:[(0,e.jsx)(R.default,{href:"/admin/collections/podcast-shows/create",children:"Create Podcast Show"})," ·"," ",(0,e.jsx)(R.default,{href:"/admin/collections/podcast-episodes/create",children:"Create Episode"})]}):(0,e.jsxs)(R.default,{href:`/admin/collections/content/create?contentType=${d}`,children:["Create ",g]})}),h.docs.length?(0,e.jsx)("ul",{children:h.docs.map(a=>(0,e.jsx)("li",{children:(0,e.jsx)(R.default,{href:`/admin/collections/content/${a.id}`,children:a.title||`Untitled ${g}`})},a.id))}):(0,e.jsxs)("p",{children:["No ",f.toLowerCase()," yet. Create your first ",g.toLowerCase()," to begin a draft."]})]})}var at=a.i(586481),au=a.i(501599),av=a.i(640328);async function aw({initPageResult:a,searchParams:b}){let c=a.req.user,d=String(c?.site?.id??"");if(b){let a=await b,c=a?.siteId;"string"==typeof c&&(d=c),a?.view}if(!d)try{let b=await a.req.payload.find({collection:"sites",where:{lifecycle:{equals:"active"}},limit:1,depth:0,overrideAccess:!0});b.docs[0]&&(d=String(b.docs[0].id))}catch{}return(0,e.jsx)("main",{children:d?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)(au.MediaCommandCenter,{siteId:d}),(0,e.jsx)("section",{className:"mt-8 border-t pt-8","aria-label":"Media Assets Management",children:(0,e.jsx)(av.MediaLibraryClient,{siteId:d})})]}):(0,e.jsx)("p",{role:"alert",children:"Select a site from your publisher context before managing media."})})}var ax=a.i(927971);let ay=1e3;var az=a.i(318549),aA=a.i(120825);let aB=a=>{let b=a.payload;return String(b?.indexingState||"queued")};async function aC({initPageResult:a}){let b,c=a.req;if(!["owner","administrator","staff"].includes(String(c.user?.role||"")))return(0,e.jsxs)("main",{children:[(0,e.jsx)("h1",{children:"Indexing Center"}),(0,e.jsx)("p",{children:"Staff access is required."})]});let d=function(a){let b=new Map;for(let c of a){let a;if(!c.indexability.indexable)continue;let d=c.dates.modifiedAt||c.dates.publishedAt,e={url:c.canonicalUrl,kind:c.contentType};if(d){let a=Date.parse(d);Number.isFinite(a)&&(e.lastmod=new Date(a).toISOString())}try{a=new URL(c.canonicalUrl)}catch{continue}if(!["http:","https:"].includes(a.protocol))continue;let f=c.media?.heroImage?.url||(c.socialImage.variantEligible?c.socialImage.variantUrl:null);if(f)try{let b=new URL(f);b.origin===a.origin&&(e.image=b.toString())}catch{}let g=c.media?.video;if(g?.url&&g?.posterUrl&&c.title.value)try{let b=new URL(g.url),d=new URL(g.posterUrl);b.origin===a.origin&&d.origin===a.origin&&(e.video={contentLoc:b.toString(),thumbnailLoc:d.toString(),title:c.title.value,description:c.description.value||c.title.value})}catch{}b.set(e.url,e)}return[...b.values()].sort((a,b)=>a.url.localeCompare(b.url))}(await (0,ax.getAllIndexableDiscoveryDocuments)(c.payload)),f=await c.payload.find({collection:"execution-events",where:{eventType:{equals:"discovery.indexing.changed"}},sort:"-createdAt",limit:50,depth:0,overrideAccess:!0}),g=new az.ManualWebmasterAdapter,h=await g.health(),i=f.docs.reduce((a,b)=>{let c=aB(b);return a[c]=(a[c]||0)+1,a},{}),j={eligibleUrls:b=d.length,pageSize:ay,partitions:((a,b=ay)=>Math.max(1,Math.ceil(a/b)))(b),generation:b>=25e3?"asynchronous-recommended":"request-streamed",asyncTriggerUrls:25e3},k=await (0,aA.searchHealth)(c.payload).catch(()=>[]);return(0,e.jsxs)("main",{className:"gutter--left gutter--right",children:[(0,e.jsx)("h1",{children:"Indexing Center"}),(0,e.jsxs)("p",{children:[d.length," eligible canonical URLs · ",j.partitions," sitemap partition(s) ·"," ",j.generation]}),(0,e.jsxs)("p",{children:[(0,e.jsx)("a",{href:"/sitemap.xml",target:"_blank",children:"Sitemap index"})," ","·"," ",(0,e.jsx)("a",{href:"/feed.xml",target:"_blank",children:"RSS"})," ","·"," ",(0,e.jsx)("a",{href:"/feed.json",target:"_blank",children:"JSON Feed"})," ","·"," ",(0,e.jsx)("a",{href:"/robots.txt",target:"_blank",children:"Robots"})]}),(0,e.jsx)("h2",{children:"Submission state"}),(0,e.jsxs)("p",{children:["Queued ",i.queued||0," · Submitted ",i.submitted||0," · Acknowledged"," ",i.acknowledged||0," · Failed ",i.failed||0," · Manual ",i.manual||0]}),(0,e.jsx)("h2",{children:"Local search health"}),(0,e.jsxs)("p",{children:["PostgreSQL is the active search provider. External-search evaluation is triggered only after"," ",aA.SEARCH_ADAPTER_THRESHOLD.corpusDocuments.toLocaleString()," documents or p95 above"," ",aA.SEARCH_ADAPTER_THRESHOLD.p95LatencyMs,"ms for"," ",aA.SEARCH_ADAPTER_THRESHOLD.consecutiveMeasurementWindows," windows."]}),(0,e.jsxs)("table",{children:[(0,e.jsx)("thead",{children:(0,e.jsxs)("tr",{children:[(0,e.jsx)("th",{children:"Site"}),(0,e.jsx)("th",{children:"Type"}),(0,e.jsx)("th",{children:"Documents"}),(0,e.jsx)("th",{children:"Missing body"}),(0,e.jsx)("th",{children:"Version mismatch"}),(0,e.jsx)("th",{children:"Last indexed"})]})}),(0,e.jsx)("tbody",{children:k.map(a=>(0,e.jsxs)("tr",{children:[(0,e.jsx)("td",{children:String(a.site_id)}),(0,e.jsx)("td",{children:String(a.content_type)}),(0,e.jsx)("td",{children:String(a.count)}),(0,e.jsx)("td",{children:String(a.missing_body)}),(0,e.jsx)("td",{children:String(a.version_mismatch)}),(0,e.jsx)("td",{children:String(a.last_indexed_at||"Never")})]},`${a.site_id}:${a.content_type}`))})]}),(0,e.jsx)("p",{children:(0,e.jsx)(R.default,{href:"/api/admin/indexing/search/reconcile",children:"Reconcile search projection (staff only)"})}),(0,e.jsx)("h2",{children:"Provider configuration"}),(0,e.jsxs)("p",{children:[h.configured?"Healthy":"Not configured",": ",h.detail]}),(0,e.jsxs)("p",{children:["No provider credentials are configured. Manual exports are handoffs and are never labelled submitted. ",(0,e.jsx)(R.default,{href:"/api/admin/indexing/export",children:"Download manual handoff JSON"})]}),(0,e.jsx)("h2",{children:"Recent changes"}),(0,e.jsxs)("table",{children:[(0,e.jsx)("thead",{children:(0,e.jsxs)("tr",{children:[(0,e.jsx)("th",{children:"When"}),(0,e.jsx)("th",{children:"State"}),(0,e.jsx)("th",{children:"Action"}),(0,e.jsx)("th",{children:"URL / issue"})]})}),(0,e.jsx)("tbody",{children:f.docs.map(a=>{let b=a.payload;return(0,e.jsxs)("tr",{children:[(0,e.jsx)("td",{children:String(a.occurredAt||a.createdAt)}),(0,e.jsx)("td",{children:aB(a)}),(0,e.jsx)("td",{children:String(b?.action||"")}),(0,e.jsx)("td",{children:(0,e.jsx)("a",{href:String(b?.url||"/admin/collections/content"),children:String(b?.url||"Inspect event")})})]},String(a.id))})})]})]})}var aD=a.i(58446),aE=a.i(985730),aF=a.i(665013),aG=a.i(419304),aH=a.i(768154),aI=a.i(378257),aJ=((b={}).collection="collections",b.global="globals",b),aK=a.i(891106),aL=a.i(157929),aM=a.i(661253),aN=a.i(336473);async function aO(a){let{payload:{config:b},payload:c}=a,d=[];if(b.globals.length>0)if(c.collections?.["payload-locked-documents"]){let e=await c.find({collection:"payload-locked-documents",depth:1,overrideAccess:!1,pagination:!1,req:a,select:{globalSlug:!0,updatedAt:!0,user:!0},where:{globalSlug:{exists:!0}}});d=b.globals.map(a=>{let b="object"==typeof a.lockDocuments?a.lockDocuments.duration:300,c=e.docs.find(b=>b.globalSlug===a.slug);return{slug:a.slug,data:{_isLocked:!!c,_lastEditedAt:c?.updatedAt??null,_userEditing:c?.user?.value??null},lockDuration:b}})}else d=b.globals.map(a=>{let b="object"==typeof a.lockDocuments?a.lockDocuments.duration:300;return{slug:a.slug,data:{_isLocked:!1,_lastEditedAt:null,_userEditing:null},lockDuration:b}});return d}var aP=((c={}).collection="collections",c.global="globals",c);function aQ(a,b){if("function"==typeof a)try{return a({user:b})}catch{return!0}return!!a}let aR="collections";async function aS(a){var b,c;let d,g,{i18n:i,payload:j,user:k}=a.req,{admin:l}=j.config.routes,{t:m}=i,n=await (0,aK.getAccessResults)({req:a.req}),o=function({req:a}){return{collections:a.payload.config.collections.map(({slug:b,admin:{hidden:c}})=>aQ(c,a.user)?null:b).filter(Boolean),globals:a.payload.config.globals.map(({slug:b,admin:{hidden:c}})=>aQ(c,a.user)?null:b).filter(Boolean)}}({req:a.req}),p=await aO(a.req),q=(b=j.config,d=b.collections.filter(a=>n?.collections?.[a.slug]?.read&&o.collections.includes(a.slug)),g=b.globals.filter(a=>n?.globals?.[a.slug]?.read&&o.globals.includes(a.slug)),c=[...d.map(a=>({type:aP.collection,entity:a}))??[],...g.map(a=>({type:aP.global,entity:a}))??[]],c.reduce((a,b)=>{if(b.entity?.admin?.group===!1)return a;if(n?.[b.type.toLowerCase()]?.[b.entity.slug]?.read){let c=(0,f.getTranslation)(b.entity.admin.group,i),d="labels"in b.entity?b.entity.labels.plural:b.entity.label,e="function"==typeof d?d({i18n:i,t:i.t}):d;if(b.entity.admin.group){let d=a.find(a=>(0,f.getTranslation)(a.label,i)===c),g=d;d||(g={entities:[],label:c},a.push(g)),g.entities.push({slug:b.entity.slug,type:b.type,label:e})}else a.find(a=>(0,f.getTranslation)(a.label,i)===i.t(`general:${b.type}`)).entities.push({slug:b.entity.slug,type:b.type,label:e})}return a},[{entities:[],label:i.t("general:collections")},{entities:[],label:i.t("general:globals")}]).filter(a=>a.entities.length>0));return(0,e.jsx)("div",{className:aR,children:(0,e.jsx)("div",{className:`${aR}__wrap`,children:q&&q?.length!==0?q.map(({entities:a,label:b},c)=>(0,e.jsxs)("div",{className:`${aR}__group`,children:[(0,e.jsx)("h2",{className:`${aR}__label`,children:b}),(0,e.jsx)("ul",{className:`${aR}__card-list`,children:a.map(({slug:a,type:b,label:c},d)=>{let g,j,o,q,r=null,s=null;if(b===aJ.collection&&(g=m("general:showAllLabel",{label:(0,f.getTranslation)(c,i)}),o=(0,h.formatAdminURL)({adminRoute:l,path:`/collections/${a}`}),j=(0,h.formatAdminURL)({adminRoute:l,path:`/collections/${a}/create`}),q=n?.collections?.[a]?.create),b===aJ.global){(0,f.getTranslation)(c,i),g=m("general:editLabel",{label:(0,f.getTranslation)(c,i)}),o=(0,h.formatAdminURL)({adminRoute:l,path:`/globals/${a}`});let b=p.find(b=>b.slug===a);if(b){r=b.data._isLocked,s=b.data._userEditing;let a=b?.lockDuration,c=new Date(b.data?._lastEditedAt).getTime();new Date().getTime()>c+1e3*a&&(r=!1,s=null)}}return(0,e.jsx)("li",{children:(0,e.jsx)(aM.Card,{actions:r&&k?.id!==s?.id?(0,e.jsx)(aN.Locked,{className:`${aR}__locked`,user:s}):q&&b===aJ.collection?(0,e.jsx)(aL.Button,{"aria-label":m("general:createNewLabel",{label:c}),buttonStyle:"icon-label",el:"link",icon:"plus",iconStyle:"with-border",round:!0,to:j}):void 0,buttonAriaLabel:g,href:o,id:`card-${a}`,title:(0,f.getTranslation)(c,i),titleAs:"h3"})},d)})})]},c)):(0,e.jsx)("p",{children:"no nav groups...."})})})}let aT={"@/modules/admin/MediaEditActionField#MediaEditActionField":d.MediaEditActionField,"@payloadcms/richtext-lexical/rsc#RscEntryLexicalCell":a=>{let{cellData:b,className:c,collectionConfig:d,field:{admin:i},field:j,i18n:k,link:l,onClick:m,payload:n,rowData:o}=a,p=i&&"className"in i?i.className:void 0,q=c||(j.admin&&"className"in j.admin?j.admin.className:null)||p,r=n.config.routes.admin,s=n.config.serverURL,t="span",u={className:q};l&&(u.prefetch=!1,t=g.Link,u.href=d?.slug?(0,h.formatAdminURL)({adminRoute:r,path:`/collections/${d?.slug}/${o.id}`,serverURL:s}):""),"function"==typeof m&&(t="button",u.type="button",u.onClick=()=>{m({cellData:b,collectionSlug:d?.slug,rowData:o})});let v=[];return b?.root?.children&&(v=function a(b,c,d=0){for(let f of b)d++,"text"in f&&f.text?c.push(f.text):"children"in f||c.push((0,e.jsxs)("code",{children:[" [",f.type,"]"]},d)),"children"in f&&f.children&&(c=a(f.children,c,d));return c}(b?.root?.children,v)),v?.length||(v=[k.t("general:noLabel",{label:(0,f.getTranslation)(("label"in j?j.label:null)||"data",k)})]),(0,e.jsx)(t,{...u,children:v})},"@payloadcms/richtext-lexical/rsc#RscEntryLexicalField":o,"@payloadcms/richtext-lexical/rsc#LexicalDiffComponent":P,"@payloadcms/richtext-lexical/client#RelationshipFeatureClient":l.RelationshipFeatureClient,"@payloadcms/richtext-lexical/client#InlineToolbarFeatureClient":l.InlineToolbarFeatureClient,"@payloadcms/richtext-lexical/client#HorizontalRuleFeatureClient":l.HorizontalRuleFeatureClient,"@payloadcms/richtext-lexical/client#UploadFeatureClient":l.UploadFeatureClient,"@payloadcms/richtext-lexical/client#BlockquoteFeatureClient":l.BlockquoteFeatureClient,"@payloadcms/richtext-lexical/client#LinkFeatureClient":l.LinkFeatureClient,"@payloadcms/richtext-lexical/client#ChecklistFeatureClient":l.ChecklistFeatureClient,"@payloadcms/richtext-lexical/client#OrderedListFeatureClient":l.OrderedListFeatureClient,"@payloadcms/richtext-lexical/client#UnorderedListFeatureClient":l.UnorderedListFeatureClient,"@payloadcms/richtext-lexical/client#IndentFeatureClient":l.IndentFeatureClient,"@payloadcms/richtext-lexical/client#AlignFeatureClient":l.AlignFeatureClient,"@payloadcms/richtext-lexical/client#HeadingFeatureClient":l.HeadingFeatureClient,"@payloadcms/richtext-lexical/client#ParagraphFeatureClient":l.ParagraphFeatureClient,"@payloadcms/richtext-lexical/client#InlineCodeFeatureClient":l.InlineCodeFeatureClient,"@payloadcms/richtext-lexical/client#SuperscriptFeatureClient":l.SuperscriptFeatureClient,"@payloadcms/richtext-lexical/client#SubscriptFeatureClient":l.SubscriptFeatureClient,"@payloadcms/richtext-lexical/client#StrikethroughFeatureClient":l.StrikethroughFeatureClient,"@payloadcms/richtext-lexical/client#UnderlineFeatureClient":l.UnderlineFeatureClient,"@payloadcms/richtext-lexical/client#BoldFeatureClient":l.BoldFeatureClient,"@payloadcms/richtext-lexical/client#ItalicFeatureClient":l.ItalicFeatureClient,"@/modules/admin/DiscoveryPanel#DiscoveryPanel":Q.DiscoveryPanel,"./modules/admin/PublishingLinks#default":function(){return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)(R.default,{href:"/admin",children:"Dashboard"}),(0,e.jsx)(R.default,{href:"/admin/posts",children:"Posts"}),(0,e.jsx)(R.default,{href:"/admin/pages",children:"Pages"}),(0,e.jsx)(R.default,{href:"/admin/media-library",children:"Media"}),(0,e.jsx)(R.default,{href:"/admin/collections/podcast-shows",children:"Podcasts"}),(0,e.jsx)(R.default,{href:"/admin/navigation",children:"Menus"}),(0,e.jsx)(R.default,{href:"/admin/indexing",children:"Indexing"}),(0,e.jsx)(R.default,{href:"/admin/globals/site-settings",children:"Site Settings"}),(0,e.jsx)(R.default,{href:"/admin/redirects",children:"Redirects"}),(0,e.jsx)(R.default,{href:"/admin/rendered-quality",children:"Rendered Quality"}),(0,e.jsx)(R.default,{href:"/admin/workflow",children:"Editorial Workflow"}),(0,e.jsx)(R.default,{href:"/admin/releases",children:"Releases"}),(0,e.jsx)(R.default,{href:"/admin/social",children:"Social Distribution"}),(0,e.jsx)(R.default,{href:"/admin/email-composer",children:"Email Composer"}),(0,e.jsx)(R.default,{href:"/admin/audience",children:"Audience Command Center"}),(0,e.jsx)(R.default,{href:"/admin/moderation",children:"Community Moderation"}),(0,e.jsx)(R.default,{href:"/admin/telemetry",children:"Telemetry & Experiments"}),(0,e.jsx)(R.default,{href:"/admin/catalog",children:"Catalog"}),(0,e.jsx)(R.default,{href:"/admin/commerce",children:"Commerce Operations"}),(0,e.jsx)(R.default,{href:"/admin/fulfillment",children:"POD & Fulfillment"}),(0,e.jsx)(R.default,{href:"/",target:"_blank",rel:"noreferrer",children:"View Site"})]})},"./modules/admin/CapabilityCenterLink#default":function(){return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)(R.default,{href:"/admin/capabilities",children:"Capability Center"}),(0,e.jsx)(R.default,{href:"/admin/security",children:"Security"})]})},"./modules/admin/PublisherDashboard#default":S,"./modules/admin/CapabilityCenter#default":aq,"./modules/admin/SecurityCenter#default":ar.default,"./modules/admin/PublishingCenter#default":as,"./modules/admin/NavigationCenter#default":at.default,"./modules/admin/MediaLibrary#default":aw,"./modules/admin/IndexingCenter#default":aC,"./modules/admin/RedirectManager#default":aD.default,"./modules/admin/RenderedQualityCenter#default":aE.default,"./modules/admin/EditorialWorkflowCenter#default":aF.default,"./modules/admin/ReleaseCenter#default":aG.default,"./modules/admin/EmailComposer#default":aH.default,"./modules/admin/AudienceCommandCenter#default":aI.default,"@payloadcms/next/rsc#CollectionCards":aS};a.s(["importMap",0,aT],370277)},686143,a=>{"use strict";a.s(["DiscoveryPanel",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call DiscoveryPanel() from the server but DiscoveryPanel is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/DiscoveryPanel.tsx","DiscoveryPanel")},726489,a=>{"use strict";var b=a.i(686143);a.n(b)},247886,a=>{"use strict";a.s(["default",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call the default export of [project]/src/modules/admin/EmailComposer.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/EmailComposer.tsx","default")},768154,a=>{"use strict";var b=a.i(247886);a.n(b)},201810,a=>{"use strict";a.s(["MediaCommandCenter",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call MediaCommandCenter() from the server but MediaCommandCenter is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/MediaCommandCenter.tsx","MediaCommandCenter")},501599,a=>{"use strict";var b=a.i(201810);a.n(b)},936499,a=>{"use strict";a.s(["MediaEditActionField",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call MediaEditActionField() from the server but MediaEditActionField is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/MediaEditActionField.tsx","MediaEditActionField")},199087,a=>{"use strict";var b=a.i(936499);a.n(b)},59345,a=>{"use strict";a.s(["MediaLibraryClient",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call MediaLibraryClient() from the server but MediaLibraryClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/MediaLibraryClient.tsx","MediaLibraryClient")},640328,a=>{"use strict";var b=a.i(59345);a.n(b)},491176,a=>{"use strict";a.s(["default",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call the default export of [project]/src/modules/admin/NavigationCenter.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/NavigationCenter.tsx","default")},586481,a=>{"use strict";var b=a.i(491176);a.n(b)},698285,a=>{"use strict";a.s(["default",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call the default export of [project]/src/modules/admin/RedirectManager.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/RedirectManager.tsx","default")},58446,a=>{"use strict";var b=a.i(698285);a.n(b)},85954,a=>{"use strict";a.s(["default",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call the default export of [project]/src/modules/admin/RenderedQualityCenter.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/RenderedQualityCenter.tsx","default")},985730,a=>{"use strict";var b=a.i(85954);a.n(b)},727498,a=>{"use strict";a.s(["default",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call the default export of [project]/src/modules/admin/SecurityCenter.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/SecurityCenter.tsx","default")},679013,a=>{"use strict";var b=a.i(727498);a.n(b)},593541,a=>{"use strict";a.s(["default",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call the default export of [project]/src/modules/admin/ThemeCenter.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/modules/admin/ThemeCenter.tsx","default")},485030,a=>{"use strict";var b=a.i(593541);a.n(b)}];

//# sourceMappingURL=_0_h76ii._.js.map