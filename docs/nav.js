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

// Only a pointer that can actually hover: a touch screen reports an enter
// around a tap, and the tap has already hopped the card.
var canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;

// Hover turns a problem card over on a desktop, but a tap is not a hover:
// on a touch screen the card would flip and stay flipped with no way back.
// Clicking toggles the class instead, so a tap turns it over and a second
// tap turns it back.
//
// The hop is a one-shot animation, so it has to be re-armed each time rather
// than left to a CSS state, which would only ever play it once.
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

  // On a touch screen the tap is the only thing that can start the hop; where
  // the pointer hovers, entering the card already did it, and one visit is
  // one bounce.
  if (!canHover) {
    hopCard(card);
  }
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

// The card's own box never moves — only the artwork inside it lifts and turns
// — so a pointer still within that box has not left the card, whatever the
// browser reports on the way.
function isPointerOverCard(card, event) {
  var box = card.getBoundingClientRect();

  return (
    event.clientX > box.left &&
    event.clientX < box.right &&
    event.clientY > box.top &&
    event.clientY < box.bottom
  );
}

// Only a pointer that can actually hover gets the enter-hop; a touch screen
// reports an enter around a tap, which the tap has already handled.
if (canHover) {
  // Bound to each card rather than to the document, because pointerenter does
  // not bubble: listening higher up would catch the enter into every span
  // inside the card and hop it again on the way to the text.
  Array.prototype.forEach.call(document.querySelectorAll('.flip-card'), function (card) {
    // One bounce per visit: the enter that starts the hop latches the card,
    // and only a leave that genuinely takes the pointer off it unlatches.
    // Without the latch a card that reports an enter again while the mouse
    // rests on it — the hop and the turn moving its artwork out from under
    // the cursor is enough — would sit there hopping on the spot.
    var isHovered = false;

    card.addEventListener('pointerenter', function () {
      if (isHovered) {
        return;
      }

      isHovered = true;
      hopCard(card);
    });

    card.addEventListener('pointerleave', function (event) {
      if (isPointerOverCard(card, event)) {
        return;
      }

      isHovered = false;
    });
  });
}
