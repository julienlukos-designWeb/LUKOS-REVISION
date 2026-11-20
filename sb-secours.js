/* LUKOS RÉVISION — Secours : si la bibliothèque Supabase n'a pas pu être chargée depuis jsDelivr
   (réseau filtré, serveur indisponible), on la charge depuis un second serveur (unpkg). */
if (!window.supabase) {
  document.write('<script src="https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js" crossorigin="anonymous"><\/script>');
}
