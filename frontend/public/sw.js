// Service worker do LeadsPlus: deixa o app instalável e mostra os
// avisos (Web Push) mesmo com o sistema fechado.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Sem cache de páginas: o sistema sempre busca a versão mais nova.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { titulo: "LeadsPlus", texto: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "LeadsPlus", {
      body: d.texto || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: d.link || "geral",
      renotify: true,
      data: { link: d.link || "/painel", loja: d.loja },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { link, loja } = e.notification.data || {};
  const url = new URL(link || "/painel", self.location.origin);
  e.waitUntil(
    (async () => {
      const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of abertas) {
        if (new URL(c.url).origin === self.location.origin) {
          c.postMessage({ tipo: "abrir", link: url.pathname + url.search, loja });
          return c.focus();
        }
      }
      if (loja) url.searchParams.set("loja", loja);
      return self.clients.openWindow(url.href);
    })(),
  );
});
