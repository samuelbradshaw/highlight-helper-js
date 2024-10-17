function Highlighter(options = hhDefaultOptions, existingHighlightsById = {}) {
  for (const key of Object.keys(hhDefaultOptions)) {
    options[key] = options[key] ?? hhDefaultOptions[key];
  }
  
  // Set up stylesheets
  const head = document.getElementsByTagName('head')[0];
  const generalStylesheet = document.createElement('style');
  const selectionStylesheet = document.createElement('style');
  const highlightsStylesheet = document.createElement('style');
  generalStylesheet.id = 'hh-general-stylesheet';
  selectionStylesheet.id = 'hh-selection-stylesheet';
  highlightsStylesheet.id = 'hh-highlights-stylesheet';
  generalStylesheet.textContent = `
    body {
      -webkit-user-select: none;
      user-select: none;
    }
    ${options.paragraphSelector} {
      -webkit-user-select: text;
      user-select: text;
    }
    ${options.containerSelector} rt,
    ${options.containerSelector} sup,
    ${options.containerSelector} sub,
    ${options.containerSelector} img {
      -webkit-user-select: none;
      user-select: none;
    }
  `;
  head.appendChild(generalStylesheet);
  head.appendChild(selectionStylesheet);
  head.appendChild(highlightsStylesheet);
  
  // Setting -1 as the tabIndex on <body> is a workaround to avoid "tap to search" in Chrome on Android. 
  document.body.tabIndex = -1;
  
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const container = document.querySelector(options.containerSelector);
  const hyperlinks = container.getElementsByTagName('a');
  const highlightsById = existingHighlightsById;
  let activeHighlightId = null;
  let allowNextHyperlinkInteraction = false;
  let previousSelectionRange = null;
  let isStylus = false;
  
  // Draw (or redraw) all highlights on the page
  this.drawHighlights = () => {
    highlightsStylesheet.textContent = '';
    for (const highlightId of Object.keys(highlightsById)) {
      const highlightInfo = highlightsById[highlightId];
      let highlightStyleBlock = getHighlightStyleBlock(highlightInfo.color, highlightInfo.style);
      highlightsStylesheet.textContent += `
        ::highlight(${highlightId}) { ${highlightStyleBlock} }
        rt::highlight(${highlightId}) { background-color: transparent; }
        sup::highlight(${highlightId}) { background-color: transparent; }
        sub::highlight(${highlightId}) { background-color: transparent; }
        img::highlight(${highlightId}) { background-color: transparent; }
      `;
    }
  }
  
  // Set the highlight color
  this.setColor = (color) => {
    let selection = window.getSelection();
    if (selection.type == 'None' && previousSelectionRange) {
      // iOS Safari deselects text when a button is tapped. This restores the selection.
      selection.addRange(previousSelectionRange);
      previousSelectionRange = null;
    }
    if (selection.type != 'Range') return;
    color = color ?? options.defaultColor;
    let style = highlightsById[activeHighlightId]?.style ?? options.defaultStyle;
    if (options.rememberStyle) options.defaultColor = color;
    if (options.rememberStyle) options.defaultStyle = style;
    updateSelectionStyle(color, style);
    createOrUpdateHighlight(color, style, activeHighlightId ? null : selection);
  }
  
  // Set the highlight style
  this.setStyle = (style) => {
    let selection = window.getSelection();
    if (selection.type == 'None' && previousSelectionRange) {
      // iOS Safari deselects text when a button is tapped. This restores the selection.
      selection.addRange(previousSelectionRange);
      previousSelectionRange = null;
    }
    if (selection.type != 'Range') return;
    let color = highlightsById[activeHighlightId]?.color ?? options.defaultColor;
    style = style ?? options.defaultStyle;
    if (options.rememberStyle) options.defaultColor = color;
    if (options.rememberStyle) options.defaultStyle = style;
    updateSelectionStyle(color, style);
    createOrUpdateHighlight(color, style, activeHighlightId ? null : selection);
  }
  
  // Activate a highlight by ID
  this.activateHighlight = (highlightId) => {
    // TODO: Figure out why Chrome on Android doesn't show selection handles when a highlight is selected
    // TODO: Show custom selection handles in desktop browser
    this.deactivateSelection();
    let selection = window.getSelection();
    let highlightToActivate = highlightsById[highlightId];
    updateSelectionStyle(highlightToActivate.color, highlightToActivate.style);
    activeHighlightId = highlightId;
    for (const highlightRange of highlightToActivate.highlight.values()) {
      selection.addRange(highlightRange);
    }
  }
  
  // Activate a link by position
  this.activateHyperlink = (position) => {
    this.deactivateSelection();
    allowNextHyperlinkInteraction = true;
    hyperlinks[position].click();      
  }
  
  // Deactivate any highlights that are currently active/selected
  this.deactivateSelection = (triggeredBySelectionChange = false) => {
    let deactivatedHighlightId = activeHighlightId;
    activeHighlightId = null;
    allowNextHyperlinkInteraction = false;
    previousSelectionRange = null;
    container.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: {
      highlightId: deactivatedHighlightId,
    }}));
    if (!triggeredBySelectionChange) window.getSelection().removeAllRanges();
    updateSelectionStyle();
  }
  
  // Remove the selected highlight or a specific highlight by ID
  this.removeHighlight = (highlightId = null) => {
    let deletedHighlightId;
    if (highlightId && highlightsById.hasOwnProperty(highlightId)) {
      deletedHighlightId = highlightId;
    } else {
      let selection = window.getSelection();
      if (selection.type == 'None' && previousSelectionRange) {
        // iOS Safari deselects text when a button is tapped. This restores the selection.
        selection.addRange(previousSelectionRange);
        previousSelectionRange = null;
      }
      if (selection.type != 'Range') return;
      if (activeHighlightId) {
        deletedHighlightId = activeHighlightId;
      }
    }
    if (deletedHighlightId) {
      this.deactivateSelection();
      delete highlightsById[deletedHighlightId];
      CSS.highlights.delete(deletedHighlightId);
      container.dispatchEvent(new CustomEvent('hh:highlightremove', { detail: {
        highlightId: deletedHighlightId,
      }}));
      this.drawHighlights();
    }
  }
  
  // Get the active highlight ID (if there is one)
  this.getActiveHighlightId = () => {
    return activeHighlightId;
  }
  
  // Get info for all highlights on the page
  this.getHighlightsById = () => {
    return highlightsById;
  }
  
  // Update one of the initialized options
  this.setOption = (key, value) => {
    options[key] = value ?? options[key];
  }
  
  // Get all of the initialized options
  this.getOptions = () => {
    return options;
  }
  
    
  // -------- EVENT LISTENERS --------
  
  // Listen for selection changes (new selection, change in selection range, or selection collapsing to a caret)
  document.addEventListener('selectionchange', (event) => { debounce(respondToSelectionChange(event), 10); });
  const respondToSelectionChange = (event) => {
    let selection = window.getSelection();
    if (selection.type != 'Range') {
      if (activeHighlightId) {
        this.deactivateSelection(true);
      } else {
        this.deactivateSelection(true);
        checkForTapTargets(selection);
      }
    } else {
      let selectionRange = selection.getRangeAt(0);
      if (options.highlightMode == 'live' || (options.highlightMode == 'auto' && isStylus == true)) {
        createOrUpdateHighlight(highlightsById[activeHighlightId]?.color ?? options.defaultColor, highlightsById[activeHighlightId]?.style ?? options.defaultColor, selection);
      } else if (activeHighlightId) {
        createOrUpdateHighlight(highlightsById[activeHighlightId].color, highlightsById[activeHighlightId].style, selection);
      }
      previousSelectionRange = selectionRange.cloneRange();
    }
  }
  
  // Listen for pointerdown events (used to detect stylus; also to restore a valid selection on iOS Safari)
  container.addEventListener('pointerdown', (event) => respondToTap(event) );
  const respondToTap = (event) => {
    isStylus = event.pointerType == 'pen';
    
    // In most browsers, tapping or clicking somewhere on the page creates a selection of 0 character length (selection.type == "Caret"). iOS Safari instead clears the selection (selection.type == "None"). This workaround adds the selection when a user taps, if it's missing, so the selectionchange event can be properly triggered.
    let selection = window.getSelection();
    if (selection.type == 'None') {
      range = getRangeFromTapEvent(event);
      selection.addRange(range);
    }
  }
  
  // Listen for pointerup events (used to adjust the text selection if snap to word is on)
  // TODO: Simplify based on this? https://stackoverflow.com/a/7380435/1349044
  window.addEventListener('pointerup', adjustSelectionRange);
  function adjustSelectionRange(event) {
    if (!options.snapToWord) return;
    
    let selection = window.getSelection();
    if (selection.type != 'Range') return;
            
    let selectionRange = selection.getRangeAt(0);
    let startNode = selectionRange.startContainer;
    let endNode = selectionRange.endContainer;
    let startOffset = selectionRange.startOffset;
    let endOffset = selectionRange.endOffset;
    
    // Trim whitespace at selection start and end
    while (/\s/.test(startOffset < startNode.wholeText.length && startNode.wholeText[startOffset])) startOffset += 1;
    while (endOffset - 1 >= 0 && /\s/.test(endNode.wholeText[endOffset - 1])) endOffset -= 1;
    // If the selection starts at the end of a text node, move it to start at the beginning of the following text node. This prevents the selection from jumping across the text node boundary and selecting an extra word.
    if (startOffset == startNode.wholeText.length) {
      let parentElement = selectionRange.commonAncestorContainer;
      let walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
      let textNode = null;
      while (!textNode || textNode !== startNode) textNode = walker.nextNode();
      textNode = walker.nextNode();
      startNode = textNode;
      startOffset = 1;
    }
    // Expand selection to word boundaries
    while (startOffset > 0 && /\S/.test(startNode.wholeText[startOffset - 1])) startOffset -= 1;
    while (endOffset + 1 <= endNode.wholeText.length && /\S/.test(endNode.wholeText[endOffset])) endOffset += 1;
    
    let newSelectionRange = document.createRange();
    newSelectionRange.setStart(startNode, startOffset);
    newSelectionRange.setEnd(endNode, endOffset);
    selection.removeAllRanges();
    selection.addRange(newSelectionRange);
  }
  
  // Listen for hyperlink clicks
  for (const hyperlink of hyperlinks) {
    hyperlink.addEventListener('click', (event) => {
      if (allowNextHyperlinkInteraction) {
        allowNextHyperlinkInteraction = false;
      } else {
        allowNextHyperlinkInteraction = true;
        event.preventDefault();
        range = getRangeFromTapEvent(event);
        let selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
  }
  
  
  // -------- MAJOR FUNCTIONS --------
  
  // Check if the selection caret (created when a user taps on text) is in the range of an existing highlight. If it is, select the highlight for editing.
  // TODO: If there's no activeHighlightId and the selection range matches the selection range of existing highlight(s), consider allowing the user to choose between creating a new highlight or editing their exiting highlight(s). This could help users who don't understand how to re-select a highlight to edit it.
  const checkForTapTargets = (selection) => {
    if (selection.type == 'None' || (Object.keys(highlightsById).length + hyperlinks.length) == 0) return;
    let tapRange = selection.getRangeAt(0);
    
    const tappedHighlights = [];
    for (const highlightId of Object.keys(highlightsById)) {
      const highlightInfo = highlightsById[highlightId];
      const highlight = highlightInfo.highlight;
      for (const range of highlight.values()) {
        if (range.comparePoint(tapRange.startContainer, tapRange.startOffset) == 0) {
          tappedHighlights.push(highlightInfo);
        }
      }
    }
    const tappedHyperlinks = [];
    for (let hyp = 0; hyp < hyperlinks.length; hyp++) {
      hyperlinks[hyp].position = hyp;
      if (selection.anchorNode.parentElement == hyperlinks[hyp]) tappedHyperlinks.push(hyperlinks[hyp]);
    }
    
    if (tappedHighlights.length == 1 && tappedHyperlinks.length == 0) {
      let tappedHighlight = tappedHighlights[0];
      this.activateHighlight(tappedHighlight.highlightId);
    } else if (tappedHighlights.length == 0 && tappedHyperlinks.length == 1) {
      allowNextHyperlinkInteraction = true;
      tappedHyperlinks[0].click();      
    } else if (tappedHighlights.length + tappedHyperlinks.length > 1) {
      let orderedElementIds = Array.from(container.querySelectorAll('[id]'), node => node.id);
      tappedHighlights.sort((a, b) => {
        return (orderedElementIds.indexOf(a.startParagraphId) - orderedElementIds.indexOf(b.startParagraphId)) || (a.startParagraphOffset - b.startParagraphOffset);
      });
      
      container.dispatchEvent(new CustomEvent('hh:ambiguousaction', { detail: {
        'tapRange': tapRange,
        'highlights': tappedHighlights,
        'hyperlinks': tappedHyperlinks,
      }}));
    }
  }
  // Update the text selection color (to match the highlight color, when a highlight is selected for editing; or, to reset to the default text selection color)
  const updateSelectionStyle = (color, style) => {
    container.dispatchEvent(new CustomEvent('hh:selectionstyleupdate', { detail: {
      color: color,
      style: style,
    }}));
      
    // TODO: Safari on iOS doesn't respect the selection color from the CSS. However, it might be possible to set the selection color from the app in WKWebView: https://stackoverflow.com/a/60510743/1349044
    // See also https://developer.apple.com/documentation/uikit/uitextselectiondisplayinteraction/4195470-handleviews
    if (color) {
      let highlightStyleBlock = getHighlightStyleBlock(color, style);
      selectionStylesheet.textContent = `::selection { ${highlightStyleBlock} }`;
    } else {
      selectionStylesheet.textContent = `::selection { background-color: Highlight; }`;
    }
  }
  
  // Get the character offset relative to the annotatable paragraph
  // Adapted from https://stackoverflow.com/a/48812529/1349044
  const getParagraphOffset = (currentNode, currentOffset, annotatableParagraph = null) => {
    if (!currentNode.parentElement) return [ null, currentOffset ]
    if (!annotatableParagraph) annotatableParagraph = currentNode.parentElement.closest(options.paragraphSelector);
    if (currentNode === annotatableParagraph) return [ annotatableParagraph.id, currentOffset ];
    let prevSibling;
    while (prevSibling = (prevSibling || currentNode).previousSibling) {
      let nodeContent = prevSibling.innerText || prevSibling.nodeValue || '';
      currentOffset += nodeContent.length;
    }
    return getParagraphOffset(currentNode.parentElement, currentOffset, annotatableParagraph);
  }
  
  // Get the character offset relative to the deepest relevant text node
  const getTextNodeOffset = (parentElement, targetOffset) => {
    let walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
    let textNode = null;
    let currentOffset = 0;
    while(!textNode || currentOffset < targetOffset) {
      textNode = walker.nextNode();
      currentOffset += textNode.wholeText.length;
    }
    let relativeOffset = textNode.wholeText.length - currentOffset + targetOffset;
    return [ textNode, relativeOffset ];
  }
  
  // Create a new highlight, or update an existing highlight when its style, color, or bounds are changed
  const createOrUpdateHighlight = (color, style, selection) => {
    if (!activeHighlightId && (!color || !style || !selection || selection.type != 'Range')) return;
    if (color && style && !selection && activeHighlightId) {
      container.dispatchEvent(new CustomEvent('hh:highlightstyleupdate', { detail: {
        highlightId: activeHighlightId,
        color: color,
        style: style,
      }}));
      highlightsById[activeHighlightId].color = color;
      highlightsById[activeHighlightId].style = style;
    } else {
      let selectionRange = selection.getRangeAt(0);
      let startNode = selectionRange.startContainer;
      let startOffset = selectionRange.startOffset;
      let endNode = selectionRange.endContainer;
      let endOffset = selectionRange.endOffset;
      let [ startParagraphId, startParagraphOffset ] = getParagraphOffset(startNode, startOffset);
      let [ endParagraphId, endParagraphOffset ] = getParagraphOffset(endNode, endOffset);
      if (!startParagraphId || !endParagraphId) return;
      
      let highlight;
      if (activeHighlightId) { // Existing highlight
        highlight = highlightsById[activeHighlightId].highlight;
        highlight.clear();
      } else { // New highlight
        highlight = new Highlight();
        let highlightId = 'hh-' + Date.now().toString();
        CSS.highlights.set(highlightId, highlight);
        activeHighlightId = highlightId;
      }
      
      let highlightRange = document.createRange();
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
      highlight.add(highlightRange);
      
      highlightsById[activeHighlightId] = {
        highlight: highlight,
        highlightId: activeHighlightId,
        color: color,
        style: style,
        text: selection.toString(),
        startParagraphId: startParagraphId,
        startParagraphOffset: startParagraphOffset,
        endParagraphId: endParagraphId,
        endParagraphOffset: endParagraphOffset,
      };
      container.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: highlightsById[activeHighlightId] }));
    }
    this.drawHighlights();
    return highlightsById[activeHighlightId];
  }
  
  
  // -------- UTILITY FUNCTIONS --------
  
  // Build CSS string for a given highlight style
  const getHighlightStyleBlock = (color, style) => {
    color = color in options.colors ? color : options.defaultColor;
    style = style in options.styles ? style : options.defaultStyle;
    let cssColorString = options.colors[color];
    let cssStyleString = options.styles[style].replace('{color}', cssColorString);
    return cssStyleString;
  }      
  
  // Convert tap or click to a selection range
  // Adapted from https://stackoverflow.com/a/12924488/1349044
  function getRangeFromTapEvent(event) {
    let range;
    if (document.caretPositionFromPoint) {
      // Most browsers (in case there are others that need the workaround)
      let caretPosition = document.caretPositionFromPoint(event.clientX, event.clientY);
      range = document.createRange();
      range.setStart(caretPosition.offsetNode, caretPosition.offset);
      range.collapse(true);
    } else if (document.caretRangeFromPoint) {
      // Safari
      range = document.caretRangeFromPoint(event.clientX, event.clientY);
    }
    return range;
  }
  
  // Debounce a function to prevent it from being executed too frequently
  // Based on https://levelup.gitconnected.com/debounce-in-javascript-improve-your-applications-performance-5b01855e086
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
}

// Default options
let hhDefaultOptions = {
  'containerSelector': 'body',
  'paragraphSelector': 'h1, h2, h3, h4, h5, h6, p, ol, ul, dl, tr',
  'colors': {
    'red': 'hsl(352, 99%, 65%)',
    'orange': 'hsl(31, 99%, 58%)',
    'yellow': 'hsl(50, 98%, 61%)',
    'green': 'hsl(75, 70%, 49%)',
    'blue': 'hsl(182, 86%, 47%)',
  },
  'styles': {
    'fill': 'background-color: hsl(from {color} h s l / 40%);',
    'single-underline': 'text-decoration: underline; text-decoration-color: {color}; text-underline-offset: 0.15em; text-decoration-thickness: 0.15em; text-decoration-skip-ink: none;',
    'double-underline': 'text-decoration: underline; text-decoration-color: {color}; text-decoration-style: double;',
    'invisible': 'background-color: transparent;',
    'redacted': 'background-color: transparent; color: transparent;',
  },
  'rememberStyle': true,
  'snapToWord': false,
  'highlightMode': 'default',
  'defaultColor': 'yellow',
  'defaultStyle': 'fill',
}
