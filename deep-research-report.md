# Embeber y controlar YouTube en Electron para una app de análisis de rugby

## Dictamen

La forma **correcta y más fiable** de integrar un vídeo de YouTube en tu app de Electron **no es** cargar `https://www.youtube.com/embed/...` directamente dentro de un `<webview>`. La arquitectura que mejor encaja con tus requisitos es esta: una **página shell local** de tu app, cargada en Electron, que contiene un **`<iframe>` normal** de YouTube con `enablejsapi=1`, y que se controla mediante la **YouTube IFrame Player API**. Si quieres más aislamiento entre el reproductor y el resto de tu UI, esa shell local puede vivir en un `WebContentsView`; lo importante es que **el reproductor de YouTube sea un `<iframe>` oficial**, no un `<webview>` apuntando directamente a YouTube. Electron desaconseja el uso de `<webview>` por problemas de estabilidad y cambios arquitectónicos, y YouTube documenta requisitos específicos de identificación y reproducción para integraciones en apps de escritorio y WebViews. citeturn1view0turn9view0turn9view1turn20view0

También hay una conclusión incómoda, pero importante: **con el player oficial de YouTube no puedes conseguir un “vídeo puro” sin ninguna UI en todos los estados**. Sí puedes ocultar los controles visibles con `controls=0` y mover toda la interacción a controles propios de tu app, pero YouTube ya no permite quitar por completo ciertos elementos de marca y UX: `showinfo` fue retirado, `modestbranding` ya no hace nada, y `rel=0` ya no elimina los vídeos relacionados, solo los restringe al mismo canal al terminar. Además, YouTube exige no tapar ni oscurecer partes del reproductor con overlays o marcos. En otras palabras: **el mínimo UI soportado, sí; cero UI absoluta, no**. citeturn4view0turn4view1turn4view2turn4view3turn20view0turn13view0

## Por qué falla el enfoque con webview

Tu observación de que el `<webview>` mide correctamente el espacio disponible, pero el contenido de YouTube acaba “encogido” arriba a la izquierda, encaja con dos hechos documentados. El primero es que Electron advierte explícitamente que `<webview>` está basado en el `webview` de Chromium, que está sufriendo cambios arquitectónicos importantes, y que eso afecta precisamente a **renderizado, navegación y enrutado de eventos**; además, Electron dice de forma expresa que **recomienda no usarlo**. El propio `<webview>` se implementa internamente con **Out-of-Process iframes** y una capa de shadow DOM sobre un `iframe`, y además no es un contenedor al que puedas tratar como si fuese un `<div>` cualquiera: por ejemplo, Electron documenta que no puedes añadirle listeners de teclado, ratón o scroll como a un elemento DOM normal. Para una app de tagging con hotkeys, eso ya es una desventaja estructural. citeturn9view0

El segundo hecho es específico de YouTube. La IFrame API **sustituye** el nodo objetivo por un `<iframe>` del reproductor, y la documentación avisa de que ese reemplazo puede alterar el layout porque el `iframe` insertado se comporta como `inline-block` por defecto. Además, en el constructor de `YT.Player`, los parámetros `width` y `height` se documentan como **tamaños en píxeles**, y el método `player.setSize()` también trabaja en **píxeles**, no en porcentajes. Si tu patrón era “creo un `<div id="player">`, lo hago `width:100%; height:100%` y ya se encargará la API”, estabas apoyándote en un comportamiento que la documentación **no promete**. Eso explica muy bien por qué “el contenedor está bien, pero el vídeo no ocupa el contenedor”: no se estaba dimensionando el **iframe real** con el contrato que la API espera. citeturn1view1turn5view4

Además, cargar el embed de YouTube directamente como documento principal de un `<webview>` es un diseño frágil también desde el lado de YouTube. Su centro de ayuda explica que el reproductor embebido está pensado para usarse **dentro de un contexto embebido** y que, cuando se accede al player embebido “directamente” sin una página contenedora o sin contexto, normalmente no hay `HTTP Referer` y el usuario puede acabar viendo el error 153. No significa que siempre vaya a fallar de esa forma exacta en Electron, pero sí que ir “straight to `/embed/...`” como documento principal de un WebView es una forma **menos robusta** de integrarlo. citeturn25view2turn20view0

Por cierto, el tamaño de tu contenedor **no parece ser el problema**. YouTube exige un viewport mínimo de 200×200 y recomienda, para 16:9, al menos 480×270. Tus ~1311×500 cumplen de sobra. Eso refuerza la idea de que el fallo no está en el `getBoundingClientRect()` del contenedor sino en **la estrategia de embed y dimensionado del player real**. citeturn1view1turn3view0

## Límites que impone YouTube

Sí hay varias cosas que puedes controlar de forma oficial. El parámetro `controls=0` oculta los controles; `disablekb=1` desactiva los atajos de teclado del player; `fs=0` oculta el botón de fullscreen; `iv_load_policy=3` evita mostrar anotaciones por defecto; y `enablejsapi=1` permite controlar el reproductor desde JavaScript. Para una app de análisis como la tuya, `disablekb=1` es especialmente útil porque evita que las teclas del reproductor compitan con tus atajos de tagging. citeturn4view0turn4view4turn4view5turn4view6turn17view3

Donde llegan los límites es en la parte estética. YouTube cambió `rel=0`: ya **no** desactiva los vídeos relacionados, solo hace que, al terminar el vídeo, los relacionados vengan del mismo canal. Además, `showinfo` se retiró de la documentación y YouTube anunció que el título del vídeo, la información del canal y el avatar **siempre** se mostrarán antes de empezar la reproducción, cuando el vídeo está en pausa y cuando termina. A eso se suma que `modestbranding` está deprecado y no tiene efecto. Por tanto, aunque durante la **reproducción activa** el player puede quedar muy limpio con `controls=0`, en los estados de inicio, pausa y final seguirá existiendo algo de UI de YouTube que no puedes eliminar por vías soportadas. citeturn4view1turn4view2turn4view3

También es importante que YouTube prohíbe explícitamente dos clases de “hacks” que suelen tentarnos en este escenario: por un lado, hacer cambios al aspecto del player que no estén documentados por la API; por otro, colocar overlays, marcos u otros elementos visuales **delante de cualquier parte del reproductor** para tapar branding, títulos o controles. Esto significa que soluciones tipo “lo incrusto y luego le pongo una capa por encima para esconder la UI” no solo son frágiles: además, chocan con las reglas del embedded player. Si vas a tener controles propios, que estén **fuera** del rectángulo del vídeo, no encima. citeturn20view0turn13view0

Por último, hay fallos que debes contemplar en tu UX sí o sí. La IFrame API puede devolver error `101` o `150` si el propietario del vídeo no permite reproducción embebida, y error `153` si la petición no incluye `HTTP Referer` o identificación equivalente del cliente. El centro de ayuda de YouTube además recuerda que los vídeos con restricción de edad no suelen reproducirse en sitios o apps de terceros y redirigen al usuario a YouTube. Si tu app debe ser “fiable”, necesita manejar estos casos con mensajes claros al usuario, no solo con `console.error`. citeturn24view0turn25view2

## Arquitectura que sí encaja con Electron

La arquitectura recomendada tiene cuatro piezas. La primera es una **shell local** de tu app, no `file://` si puedes evitarlo. Electron recomienda no usar `file://` y preferir protocolos personalizados porque `file://` tiene privilegios especiales y se comporta distinto a los orígenes web habituales; además, si registras un protocolo propio como **standard** y **secure**, Electron dice que se comporta de forma mucho más parecida a `http/https`, resolviendo rutas relativas y permitiendo APIs de almacenamiento. En otras palabras, una shell servida desde algo como `app://bundle/player.html` es mejor base que `file:///.../player.html`. citeturn15view0turn28view1turn28view2

La segunda pieza es el endurecimiento normal de Electron. Para cualquier contenido remoto, Electron recomienda no habilitar `nodeIntegration`, mantener `contextIsolation`, activar `sandbox` y no desactivar `webSecurity`. Esto vale tanto si la shell vive en tu renderer principal como si la metes en un `WebContentsView`. Si tu prioridad es la separación de procesos y minimizar superficie de ataque, `WebContentsView` es la alternativa moderna soportada por Electron; `BrowserView` está deprecado y `<webview>` no está recomendado. citeturn11view0turn29view0turn29view1turn9view2turn9view1

La tercera pieza es el embed propiamente dicho: dentro de la shell local debes crear **tú** el `<iframe>` de YouTube, con CSS que lo haga ocupar el 100% del contenedor, y luego vincularlo a `YT.Player`. Esta parte es clave: la documentación de la IFrame API incluye un ejemplo de “usar la API con un `<iframe>` existente”, y ese patrón evita los problemas de layout asociados a que la API reemplace un `<div>` intermedio. Además, si quieres reforzar el tamaño, puedes sincronizar el tamaño del player con `player.setSize(widthPx, heightPx)` cada vez que cambie el contenedor. citeturn1view1turn5view4

La cuarta pieza es el **Referer**. Desde 2025, la IFrame API documenta el error `153` y enlaza a los requisitos de identidad del cliente. El documento de “Required Minimum Functionality” es muy explícito: en integraciones de escritorio y WebViews, el `HTTP Referer` suele venir vacío por defecto y el cliente debe tomar medidas para proporcionar su identidad; YouTube recomienda `strict-origin-when-cross-origin` como política de referrer y advierte que una política que suprima el `Referer` puede romper la reproducción. En Electron, la manera natural de cumplir esto es interceptar las peticiones del reproductor con `session.webRequest.onBeforeSendHeaders` y añadir un `Referer` válido cuando falte, porque Electron permite modificar los headers de salida precisamente en ese punto del ciclo de petición. citeturn20view0turn24view0turn22view0turn27view0

Dicho de forma práctica: si no quieres montar un pequeño servidor local HTTP para darle al player un origen “web” convencional, la combinación **`app://` + `webRequest` para inyectar `Referer`** es la opción más natural en Electron. Y si prefieres la ruta más parecida a un navegador normal, una shell servida desde `http://127.0.0.1:<puerto>` también es una opción razonable; esa recomendación es una inferencia técnica a partir de los requisitos de `Referer` de YouTube y de la recomendación de Electron de evitar `file://`. citeturn20view0turn15view0turn28view1turn22view0

## Implementación de referencia

La idea base es que el rectángulo del vídeo sea un `<iframe>` tuyo, no un `iframe` que aparezca “por detrás” de un `<div>` sustituido por YouTube:

```js
// main.js
const path = require('node:path');
const { app, BrowserWindow, protocol, net, session } = require('electron');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const url = new URL(req.url);

    // app://bundle/index.html
    if (url.host !== 'bundle') {
      return new Response('Not found', { status: 404 });
    }

    const filePath = path.join(__dirname, 'renderer', url.pathname === '/' ? 'index.html' : url.pathname);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  // Añade Referer para YouTube cuando falte.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://www.youtube.com/*',
        'https://www.youtube-nocookie.com/*'
      ]
    },
    (details, callback) => {
      if (!details.requestHeaders.Referer) {
        // Sustituye esto por tu app ID/bundle ID real.
        details.requestHeaders.Referer = 'https://com.example.rugbyanalyzer';
      }

      callback({ requestHeaders: details.requestHeaders });
    }
  );

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false
    }
  });

  win.loadURL('app://bundle/index.html');
});
```

Ese patrón sigue lo que Electron documenta para protocolos personalizados, para modificar headers con `webRequest`, y para endurecer renderers con `nodeIntegration: false`, `contextIsolation` y `sandbox`. El header `Referer` adicional responde a una exigencia documentada por YouTube para integraciones de escritorio/WebView y evita el error 153 cuando el entorno no lo envía por sí solo. citeturn28view1turn22view0turn11view0turn29view0turn20view0turn24view0

La shell del reproductor puede ser tan simple como esto:

```html
<!-- index.html -->
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: #111;
      }

      #video-container {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }

      #yt-frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
      }
    </style>
  </head>
  <body>
    <div id="video-container">
      <iframe
        id="yt-frame"
        title="YouTube player"
        src="https://www.youtube.com/embed/M7lc1UVf-VE?enablejsapi=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0&playsinline=1"
        allow="autoplay; encrypted-media"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    </div>

    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
      const container = document.getElementById('video-container');
      let player;
      let desiredRate = 1;

      function syncPlayerSize() {
        if (!player) return;
        const rect = container.getBoundingClientRect();
        player.setSize(Math.round(rect.width), Math.round(rect.height));
      }

      function onYouTubeIframeAPIReady() {
        player = new YT.Player('yt-frame', {
          events: {
            onReady: () => {
              syncPlayerSize();
              window.playerApi = {
                play: () => player.playVideo(),
                pause: () => player.pauseVideo(),
                seekTo: (seconds, allowSeekAhead = true) => player.seekTo(seconds, allowSeekAhead),
                setRate: (rate) => {
                  desiredRate = rate;
                  player.setPlaybackRate(rate);
                },
                getCurrentTime: () => player.getCurrentTime(),
                getDuration: () => player.getDuration(),
                getState: () => player.getPlayerState(),
                getBufferedFraction: () => player.getVideoLoadedFraction(),
                loadVideo: (videoId, startSeconds = 0) => {
                  player.loadVideoById({ videoId, startSeconds });
                  // loadVideoById resetea playbackRate a 1.
                  if (desiredRate !== 1) {
                    setTimeout(() => player.setPlaybackRate(desiredRate), 0);
                  }
                },
                cueVideo: (videoId, startSeconds = 0) => {
                  player.cueVideoById({ videoId, startSeconds });
                  if (desiredRate !== 1) {
                    setTimeout(() => player.setPlaybackRate(desiredRate), 0);
                  }
                }
              };
            },
            onError: (event) => {
              console.error('YouTube player error:', event.data);
              // 101/150: embed deshabilitado por el propietario
              // 153: falta Referer o identidad equivalente
            }
          }
        });

        new ResizeObserver(syncPlayerSize).observe(container);
      }

      window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
    </script>
  </body>
</html>
```

Aquí hay varias decisiones importantes. El `<iframe>` **ya existe** y es el que recibe tu CSS, tal como permite la propia IFrame API. `player.setSize()` trabaja en píxeles y te asegura que el tamaño efectivo del reproductor siga al del contenedor. `allow="autoplay; encrypted-media"` y `allowfullscreen` van en la línea de los ejemplos de YouTube y del modelo de permisos de `iframe`; `referrerpolicy="strict-origin-when-cross-origin"` evita políticas demasiado agresivas que supriman el `Referer`. Y `controls=0`, `disablekb=1`, `fs=0`, `iv_load_policy=3` y `rel=0` dejan el player en el mínimo UI soportado. citeturn1view1turn5view4turn4view0turn4view2turn4view4turn4view5turn4view6turn25view2turn27view0turn27view1

Para el control desde tu app, la IFrame API cubre exactamente lo que necesitas: `playVideo()`, `pauseVideo()`, `seekTo()`, `setPlaybackRate()`, `getCurrentTime()`, `getDuration()`, `getPlayerState()` y `getVideoLoadedFraction()`. Hay además dos detalles finos que en una app de análisis se notan mucho. Primero, `seekTo()` avanza al **keyframe anterior más cercano** si esa porción no está ya descargada; si construyes un scrubber personalizado, YouTube recomienda usar `allowSeekAhead=false` mientras el usuario arrastra y `true` al soltar. Segundo, `setPlaybackRate()` **no garantiza** el cambio si el vídeo no soporta esa velocidad y, además, al cargar o cuear un vídeo nuevo la velocidad vuelve a `1`, así que conviene reaplicarla cuando cambias de clip o de partido. citeturn5view1turn5view3turn6view0turn26view0turn26view1turn26view2turn30view0

Si quieres además reducir personalización y tracking, puedes cambiar el dominio del embed a `youtube-nocookie.com`. YouTube lo documenta como “Privacy Enhanced Mode”. Eso **no** elimina las limitaciones de UI ni te exime de cumplir TOS, pero sí cambia cómo se usan esas visualizaciones para personalización. citeturn25view2turn3view1

## Decisión práctica para tu app de rugby

Si el objetivo real es: “quiero un vídeo de YouTube embebido que ocupe todo mi contenedor, controlado por mi app, con la menor UI posible y sin pelearme con rarezas de renderizado en Electron”, la decisión práctica es esta: **abandona el `<webview>` como superficie del reproductor**, usa una **shell local** de Electron, crea un **`<iframe>` propio** de YouTube al 100% del contenedor, inicializa sobre él la **IFrame API oficial**, y añade el **`Referer`** que YouTube exige en integraciones de escritorio cuando sea necesario. Si quieres aislamiento extra, mete esa shell en `WebContentsView`; si no, un renderer endurecido también puede valer. citeturn9view0turn1view0turn9view1turn20view0turn22view0turn11view0

Si el requisito innegociable es literalmente “**cero UI de YouTube** en cualquier estado”, entonces con el player oficial la respuesta honesta es que **no es posible**. La única forma técnica de conseguirlo sería dejar de usar el reproductor oficial y reproducir el contenido en un `<video>` propio a partir del stream o del archivo, pero esa vía entra en conflicto con las políticas de YouTube: sus normas prohíben modificar o construir sobre funcionalidades del player y también prohíben acceder al contenido audiovisual por tecnologías distintas de YouTube API Services. Para una app de escritorio que solo dispone del vídeo de YouTube y no del archivo fuente, el techo realista es el **mínimo UI soportado**, no la desaparición total de la capa YouTube. citeturn20view0turn13view0