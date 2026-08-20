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
//
// The hop is a one-shot animation, so it has to be re-armed each time rather
// than left to a CSS state: hovering on, hovering off and tapping all start
// the same turn, and the card should rise and land on every one of them.
function hopCard(card) {
  card.classList.remove('is-hopping');
  // Reading the layout in between is what makes the browser treat the class
  // as newly added; without it the animation never restarts.
  void card.offsetWidth;
  card.classList.add('is-hopping');
}

document.addEventListener('click', function (event) {
  var card = event.target.closest('.flip-card');

  if (!card) {
    return;
  }

  card.classList.toggle('is-flipped');
  hopCard(card);
});

document.addEventListener('animationend', function (event) {
  if (event.animationName !== 'flip-hop') {
    return;
  }

  var card = event.target.closest('.flip-card');

  if (card) {
    card.classList.remove('is-hopping');
  }
});

// Only a pointer that can actually hover; a touch screen reports enter and
// leave around a tap, which would hop the card twice for one turn.
if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
  document.addEventListener('pointerenter', function (event) {
    var card = event.target.closest && event.target.closest('.flip-card');

    if (card) {
      hopCard(card);
    }
  }, true);

  document.addEventListener('pointerleave', function (event) {
    var card = event.target.closest && event.target.closest('.flip-card');

    if (card) {
      hopCard(card);
    }
  }, true);
}
