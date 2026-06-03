// MyEiruv Service Worker
const CACHE = 'myeiruv-v2';
const OFFLINE_URLS = ['/'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      return cache.addAll(OFFLINE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  // Network first - always get fresh content
  // Fall back to cache only if offline
  if(e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(res){
      // Cache successful responses for the main page
      if(res.ok && e.request.url.includes(self.location.origin)){
        var clone = res.clone();
        caches.open(CACHE).then(function(cache){ cache.put(e.request, clone); });
      }
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(cached){
        return cached || new Response('Offline — please reconnect to use MyEiruv', {status:503});
      });
    })
  );
});
