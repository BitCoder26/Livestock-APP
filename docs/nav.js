// The mobile menu is a CSS checkbox with no scripting of its own, so nothing
// resets it once a link is used. Same-page anchors would otherwise leave the
// panel open on top of the section they just jumped to.
document.addEventListener('click', function (event) {
  if (!event.target.closest('.top-nav a')) {
    return;
  }

  var toggle = document.getElementById('nav-toggle');

  if (toggle) {
    toggle.checked = false;
  }
});

// Hover turns a problem card over on a desktop, but a tap is not a hover:
// on a touch screen the card would flip and stay flipped with no way back.
// Clicking toggles the class instead, so a tap turns it over and a second
// tap turns it back.
document.addEventListener('click', function (event) {
  var card = event.target.closest('.flip-card');

  if (!card) {
    return;
  }

  card.classList.toggle('is-flipped');
});
