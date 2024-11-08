function Highlighter(options = hhDefaultOptions) {
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
    ${options.containerSelector} {
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
    .hh-wrapper-start, .hh-wrapper-end {
      position: relative;
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
  const isIosSafari = isSafari && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
  const container = document.querySelector(options.containerSelector);
  const hyperlinks = container.getElementsByTagName('a');
  const highlightsById = {};
  let activeHighlightId = null;
  let allowNextHyperlinkInteraction = false;
  let previousSelectionRange = null;
  let isStylus = false;
  let selectionIsReady = false;
  
  
  // -------- PUBLIC METHODS --------
  
  // Load highlights
  this.loadHighlights = (highlights) => {
    for (const highlight of highlights) {
      this.createOrUpdateHighlight(highlight, false);
    }
    container.dispatchEvent(new CustomEvent('hh:highlightsload', { detail: { addedCount: highlights.length, totalCount: Object.keys(highlightsById).length } }));
  }
  
  // Draw (or redraw) all highlights on the page
  this.drawHighlights = () => {
    // TODO: Provide SVG drawing option as a fallback for browsers that don't support the Custom Highlight API
    highlightsStylesheet.textContent = '';
    for (const highlightId of Object.keys(highlightsById)) {
      const highlightInfo = highlightsById[highlightId];
      let highlightStyleBlock = getHighlightStyleBlock(highlightInfo.color, highlightInfo.style);
      highlightsStylesheet.textContent += `
        ::highlight(${highlightId}) { ${highlightStyleBlock} }
        rt::highlight(${highlightId}) { color: inherit; background-color: transparent; }
        sup::highlight(${highlightId}) { color: inherit; background-color: transparent; }
        sub::highlight(${highlightId}) { color: inherit; background-color: transparent; }
        img::highlight(${highlightId}) { color: inherit; background-color: transparent; }
      `;
    }
  }
  
  // Create a new highlight, or update an existing highlight when it changes
  this.createOrUpdateHighlight = (attributes = {}, triggeredByUserAction = true) => {
    let highlightId = attributes.highlightId ?? activeHighlightId;
    let highlightObj, oldHighlightInfo;
    appearanceChanges = [];
    boundsChanges = [];
    
    let isNewHighlight = false;
    if (!highlightId || !highlightsById.hasOwnProperty(highlightId)) { // New highlight
      highlightObj = new Highlight();
      highlightId = highlightId || options.highlightIdFunction();
      CSS.highlights.set(highlightId, highlightObj);
      isNewHighlight = true;
    } else {
      oldHighlightInfo = highlightsById[highlightId];
      highlightObj = oldHighlightInfo.highlightObj;
    }
    
    // Log appearance changes
    for (const key of ['color', 'style', 'wrapper', 'wrapperVariables', 'readOnly']) {
      if (isNewHighlight || (attributes[key] != null && attributes[key] != oldHighlightInfo[key])) appearanceChanges.push(key);
    }
    
    // If the highlight was and still is read-only, return
    if (oldHighlightInfo?.readOnly && (attributes.readOnly == null || attributes.readOnly === true)) return this.deactivateHighlights();
    
    // Calculate the bounds of the highlight range, if it's changed
    let selectionRange, highlightRange;
    let startNode, startOffset, endNode, endOffset;
    let startParagraphId, startParagraphOffset, endParagraphId, endParagraphOffset;
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    if (selection.type == 'Range') selectionRange = selection.getRangeAt(0);
    if ((attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset  != null) || selectionRange) {
      if (attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) {
        startParagraphId = attributes.startParagraphId ?? oldHighlightInfo?.startParagraphId;
        startParagraphOffset = parseInt(attributes.startParagraphOffset) ?? oldHighlightInfo?.startParagraphOffset;
        endParagraphId = attributes.endParagraphId ?? oldHighlightInfo?.endParagraphId;
        endParagraphOffset = parseInt(attributes.endParagraphOffset) ?? oldHighlightInfo?.endParagraphOffset;
        ([ startNode, startOffset ] = getTextNodeOffset(document.getElementById(startParagraphId), startParagraphOffset));
        ([ endNode, endOffset ] = getTextNodeOffset(document.getElementById(endParagraphId), endParagraphOffset));
      } else if (selectionRange) {
        startNode = selectionRange.startContainer;
        startOffset = selectionRange.startOffset;
        endNode = selectionRange.endContainer;
        endOffset = selectionRange.endOffset;
        ([ startParagraphId, startParagraphOffset ] = getParagraphOffset(startNode, startOffset));
        ([ endParagraphId, endParagraphOffset ] = getParagraphOffset(endNode, endOffset));
      }
      
      // Create the new highlight range
      highlightRange = document.createRange();
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
      if (options.snapToWord) highlightRange = snapRangeToWord(highlightRange);
      
      // If there are any issues with the range, set the highlight back to how it was
      if (startNode == null || startOffset == null || endNode == null || endOffset == null || startParagraphId == null || startParagraphOffset == null || endParagraphId == null || endParagraphOffset == null || highlightRange.toString() == '') {
        return isNewHighlight ? null : this.createOrUpdateHighlight(oldHighlightInfo);
      }
      
      // Add the range to the highlight
      highlightObj.clear();
      highlightObj.add(highlightRange);
      
      // Log bounds changes
      for (const key of ['startParagraphId', 'startParagraphOffset', 'endParagraphId', 'endParagraphOffset']) {
        if (isNewHighlight || eval(key) != oldHighlightInfo[key]) boundsChanges.push(key);
      }
    }
    
    // If there are no changes, return
    if (isNewHighlight && boundsChanges.length == 0 || appearanceChanges.length + boundsChanges.length == 0) return;
    
    // Update saved highlight info
    const newHighlightInfo = {
      highlightId: highlightId,
      color: attributes?.color ?? oldHighlightInfo?.color ?? options.defaultColor,
      style: attributes?.style ?? oldHighlightInfo?.style ?? options.defaultStyle,
      wrapper: attributes?.wrapper ?? oldHighlightInfo?.wrapper ?? options.defaultWrapper,
      wrapperVariables: attributes?.wrapperVariables ?? oldHighlightInfo?.wrapperVariables ?? {},
      readOnly: attributes?.readOnly ?? oldHighlightInfo?.readOnly ?? false,
      startParagraphId: startParagraphId ?? oldHighlightInfo?.startParagraphId,
      startParagraphOffset: startParagraphOffset ?? oldHighlightInfo?.startParagraphOffset,
      endParagraphId: endParagraphId ?? oldHighlightInfo?.endParagraphId,
      endParagraphOffset: endParagraphOffset ?? oldHighlightInfo?.endParagraphOffset,
      text: highlightRange.toString(),
      highlightObj: highlightObj,
    };
    highlightsById[highlightId] = newHighlightInfo;
    if (options.rememberStyle && triggeredByUserAction) {
      if (appearanceChanges.includes('color')) options.defaultColor = newHighlightInfo.color;
      if (appearanceChanges.includes('style')) options.defaultStyle = newHighlightInfo.style;
      if (appearanceChanges.includes('wrapper')) options.defaultWrapper = newHighlightInfo.wrapper;
    }
    
    // Update wrapper
    // TODO: Enable wrappers for editable highlights
    if (newHighlightInfo.readOnly) {
      if (newHighlightInfo.wrapper && (options.wrappers[newHighlightInfo.wrapper]?.start || options.wrappers[newHighlightInfo.wrapper]?.end)) {
        if (appearanceChanges.includes('wrapper') || appearanceChanges.includes('wrapperVariables') || boundsChanges.length > 0) {
          document.querySelectorAll(`[data-highlight-id="${highlightId}"].hh-wrapper-start, [data-highlight-id="${highlightId}"].hh-wrapper-end`).forEach(el => el.remove());
          
          function addWrapper(edge, range, htmlString) {
            htmlString = `<span class="hh-wrapper-${edge}" data-highlight-id="${highlightId}">${htmlString}</span>`
            htmlString = htmlString.replace('{color}', options.colors[newHighlightInfo.color]);
            for (const key of Object.keys(newHighlightInfo.wrapperVariables)) {
              htmlString = htmlString.replace(`{${key}}`, newHighlightInfo.wrapperVariables[key]);
            }
            const template = document.createElement('template');
            template.innerHTML = htmlString;
            let htmlElement = template.content.firstChild;
            
            const textNodeIter = document.createNodeIterator(htmlElement, NodeFilter.SHOW_TEXT);
            while (node = textNodeIter.nextNode()) node.parentNode.removeChild(node);
            range.insertNode(htmlElement);
          }
          const startRange = highlightRange;
          const endRange = document.createRange(); endRange.setStart(highlightRange.endContainer, highlightRange.endOffset);
          const wrapperInfo = options.wrappers[newHighlightInfo.wrapper];
          addWrapper('start', startRange, wrapperInfo.start);
          addWrapper('end', endRange, wrapperInfo.end);
          
          const elementsToNormalize = document.querySelectorAll(`#${oldHighlightInfo?.startParagraphId}, #${oldHighlightInfo?.endParagraphId}, #${newHighlightInfo.startParagraphId}, #${newHighlightInfo.startParagraphId}`);
          for (const element of elementsToNormalize) element.normalize();
        }
      } else {
        document.querySelectorAll(`[data-highlight-id="${highlightId}"].hh-wrapper-start, [data-highlight-id="${highlightId}"].hh-wrapper-end`).forEach(el => el.remove());
      }
    }
    
    const detail = {
      highlight: newHighlightInfo,
      changes: appearanceChanges.concat(boundsChanges),
    }
    if (isNewHighlight) {
      container.dispatchEvent(new CustomEvent('hh:highlightcreate', { detail: detail }));
    } else {
      container.dispatchEvent(new CustomEvent('hh:highlightupdate', { detail: detail }));
    }
    this.drawHighlights();
    
    if (triggeredByUserAction) {
      if (appearanceChanges.length > 0) updateSelectionStyle(newHighlightInfo.color, newHighlightInfo.style);
      if (highlightId != activeHighlightId) this.activateHighlight(highlightId);
    }
    return newHighlightInfo;
  }
  
  // Activate a highlight by ID
  this.activateHighlight = (highlightId) => {
    // TODO: Support draggable selection handles for desktop browsers
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    const highlightToActivate = highlightsById[highlightId];
    if (highlightToActivate.readOnly) {
      // If the highlight is read-only, return an event, but don't actually activate it
      return container.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
    }
    const highlightRange = highlightToActivate.highlightObj.values().next().value.cloneRange();
    updateSelectionStyle(highlightToActivate.color, highlightToActivate.style);
    if (selection.type != 'Range') {
      selection.removeAllRanges();
      selection.addRange(highlightRange);
    }
    activeHighlightId = highlightId;
    container.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
  }
  
  // Activate a link by position
  this.activateHyperlink = (position) => {
    this.deactivateHighlights();
    allowNextHyperlinkInteraction = true;
    hyperlinks[position].click();      
  }
  
  // Deactivate any highlights that are currently active/selected
  this.deactivateHighlights = () => {
    const deactivatedHighlight = highlightsById[activeHighlightId];
    const deactivatedHighlightRange = deactivatedHighlight?.highlightObj?.values()?.next()?.value;
    activeHighlightId = null;
    allowNextHyperlinkInteraction = false;
    previousSelectionRange = null;
    window.getSelection().removeAllRanges();
    updateSelectionStyle();
//     if (deactivatedHighlight && deactivatedHighlightRange.collapsed) {
//       // Sometimes when tapping to activate a highlight, the highlight's range collapses to a caret and the highlight immediately deactivates itself. This is a workaround to fix it.
//       console.log('Log: Highlight range collapsed');
//       this.createOrUpdateHighlight(deactivatedHighlight);
//     }
    container.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: {
      highlightId: deactivatedHighlight?.highlightId,
    }}));
  }
  
  // Remove the selected highlight or a specific highlight by ID
  this.removeHighlight = (highlightId = null) => {
    let deletedHighlightId;
    if (highlightId && highlightsById.hasOwnProperty(highlightId)) {
      deletedHighlightId = highlightId;
    } else {
      const selection = getRestoredSelectionOrCaret(window.getSelection());
      if (selection.type != 'Range') return;
      if (activeHighlightId) {
        deletedHighlightId = activeHighlightId;
      }
    }
    if (deletedHighlightId) {
      this.deactivateHighlights();
      document.querySelectorAll(`.${deletedHighlightId}.hh-wrapper-start, .${deletedHighlightId}.hh-wrapper-end`).forEach(el => el.remove());
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
  
  // Get info for specified highlights, or all highlights on the page
  this.getHighlightsById = (highlightIds = []) => {
    if (highlightIds && highlightIds.length > 0) {
      const filteredHighlightsById = {}
      for (const highlightId of highlightIds) {
        filteredHighlightsById[highlightId] = highlightsById[highlightId];
      }
      return filteredHighlightsById;
    } else {
      return highlightsById;
    }
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
  
  // Selection change in document (new selection, change in selection range, or selection collapsing to a caret)
  document.addEventListener('selectionchange', (event) => respondToSelectionChange(event) );
  const respondToSelectionChange = (event) => {
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    // Deactivate active highlight when tapping outside the highlight
    if (activeHighlightId && selection.type == 'Caret' && highlightsById[activeHighlightId].highlightObj.values().next().value.comparePoint(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset) != 0) {
      this.deactivateHighlights();
    }
    if (isSafari && selection.type == 'Caret' && !activeHighlightId) {
      // SAFARI ONLY: Check for tapped highlights or links (for other browsers, see pointerup event listener)
      checkForTapTargets(selection);
    } else if (selection.type == 'Range') {
      selectionIsReady = true;
      const selectionRange = selection.getRangeAt(0);
      let color = highlightsById[activeHighlightId]?.color ?? options.defaultColor;
      let style = highlightsById[activeHighlightId]?.style ?? options.defaultStyle;
      if (!activeHighlightId && (options.pointerMode == 'live' || (options.pointerMode == 'auto' && isStylus == true))) {
        this.createOrUpdateHighlight();
      }
      if (activeHighlightId) this.createOrUpdateHighlight();
      previousSelectionRange = selectionRange.cloneRange();
    }
  }
  
  // Pointer down in annotatable container
  container.addEventListener('pointerdown', respondToTap);
  function respondToTap(event) {
    isStylus = event.pointerType == 'pen';
  }
  
  // Pointer up in annotatable container
  container.addEventListener('pointerup', (event) => {
    // NON-SAFARI BROWSERS: Check for tapped highlights or links (for Safari, see selectionchange event listener)
    if (isSafari) return;
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection = getRestoredSelectionOrCaret(selection, event);
    checkForTapTargets(selection);
  });
  
  // Pointer up in window
  window.addEventListener('pointerup', respondToPointerUp);
  function respondToPointerUp(event) {
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    if (selection.type == 'Range' && options.snapToWord) {
      const selectionRange = snapRangeToWord(selection.getRangeAt(0)).cloneRange();
      selection.removeAllRanges();
      selection.addRange(selectionRange);
    }
  }
  
  // Hyperlink click (for each hyperlink in annotatable container)
  // TODO: See if there's a way to avoid Safari popup blocker when opening links
  for (const hyperlink of hyperlinks) {
    hyperlink.addEventListener('click', (event) => {
      if (allowNextHyperlinkInteraction) {
        allowNextHyperlinkInteraction = false;
      } else {
        allowNextHyperlinkInteraction = true;
        event.preventDefault();
        const range = getRangeFromTapEvent(event);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
  }
  
  // Click in annotatable container
  // TODO: If you attempt to select any text programmatically before the user has long-pressed to create a selection (for example, if you tap an existing highlight after the page loads), iOS Safari selects the text, but it doesn't show the selection UI (selection handles and selection overlay). This workaround opens a temporary tab and closes it, to force Safari to re-focus the original page, which causes the selection UI to show as expected. A better workaround or fix is needed.
  if (isIosSafari) {
    container.addEventListener('click', (event) => changeSafariFocus(event) );
    const changeSafariFocus = (event) => {
      if (!selectionIsReady) {
        const tempTab = window.open('', 'temporary');
        tempTab.document.body.innerHTML = '<meta name="viewport" content="width=device-width, user-scalable=yes, initial-scale=1.0">Workaround for initial text selection on iOS Safari...';
        setTimeout(() => {
          tempTab.close();
          selectionIsReady = true;
        }, 500);
      }
    }
  } else {
    selectionIsReady = true;
  }
    
  
  // -------- UTILITY FUNCTIONS --------
    
  // Check if the selection caret (created when a user taps on text) is in the range of an existing highlight or link. If it is, activate the highlight or link.
  const checkForTapTargets = (selection) => {
    if (selection.type != 'Caret' || (Object.keys(highlightsById).length + hyperlinks.length) == 0) return;
    
    let tapRange = selection.getRangeAt(0);
    const tappedHighlights = [];
    for (const highlightId of Object.keys(highlightsById)) {
      const highlightInfo = highlightsById[highlightId];
      const highlightObj = highlightInfo.highlightObj;
      const highlightRange = highlightObj.values().next().value;
      if (highlightRange.comparePoint(tapRange.startContainer, tapRange.startOffset) == 0) {
        tappedHighlights.push(highlightInfo);
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
    if (color && style) {
      let highlightStyleBlock = getHighlightStyleBlock(color, style);
      selectionStylesheet.textContent = `::selection { ${highlightStyleBlock} }`;
    } else {
      selectionStylesheet.textContent = `::selection { background-color: Highlight; }`;
    }
    container.dispatchEvent(new CustomEvent('hh:selectionupdate', { detail: {
      color: color,
      style: style,
    }}));
  }
  
  // Snap the selection or highlight range to the nearest word
  function snapRangeToWord(range) {
    let startNode = range.startContainer;
    let endNode = range.endContainer;
    let startOffset = range.startOffset;
    let endOffset = range.endOffset;
    
    // Trim whitespace at range start and end
    while (/\s/.test(startOffset < startNode.wholeText.length && startNode.wholeText[startOffset])) startOffset += 1;
    while (endOffset - 1 >= 0 && /\s/.test(endNode.wholeText[endOffset - 1])) endOffset -= 1;
    
    // If the range starts at the end of a text node, move it to start at the beginning of the following text node. This prevents the range from jumping across the text node boundary and selecting an extra word.
    if (startOffset == startNode.wholeText.length) {
      let parentElement = range.commonAncestorContainer;
      let walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
      let textNode = null;
      while (!textNode || textNode !== startNode) textNode = walker.nextNode();
      textNode = walker.nextNode();
      startNode = textNode;
      startOffset = 1;
    }
    
    // Expand range to word boundaries
    while (startOffset > 0 && /\S/.test(startNode.wholeText[startOffset - 1])) startOffset -= 1;
    while (endOffset + 1 <= endNode.wholeText.length && /\S/.test(endNode.wholeText[endOffset])) endOffset += 1;
    
    let newRange = document.createRange();
    newRange.setStart(startNode, startOffset);
    newRange.setEnd(endNode, endOffset);
    return newRange;
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
  
  // Build CSS string for a given highlight style
  const getHighlightStyleBlock = (color, style) => {
    color = color in options.colors ? color : options.defaultColor;
    style = style in options.styles ? style : options.defaultStyle;
    let cssColorString = options.colors[color];
    let cssStyleString = options.styles[style].replace('{color}', cssColorString);
    return cssStyleString;
  }      
  
  // Restore the previous selection range in case the browser clears the selection
  const getRestoredSelectionOrCaret = (selection, pointerEvent = null) => {
    if (selection.type == 'None') {
      if (previousSelectionRange) {
        // iOS Safari deselects text when a button is tapped. This restores the selection.
        selection.addRange(previousSelectionRange);
      } else if (pointerEvent) {
        // In most browsers, tapping or clicking somewhere on the page creates a selection of 0 character length (selection.type == "Caret"). iOS Safari instead clears the selection (selection.type == "None"). This restores a Caret selection if the selection type is None.
        let range = getRangeFromTapEvent(pointerEvent);
        selection.addRange(range);
      }
    }
    return selection;
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
  // Adapted from https://levelup.gitconnected.com/debounce-in-javascript-improve-your-applications-performance-5b01855e086
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


// -------- DEFAULTS --------

// Default function for generating a highlight ID
const hhGetNewHighlightId = () => {
  return 'hh-' + Date.now().toString();
}

// Default options
let hhDefaultOptions = {
  containerSelector: 'body',
  paragraphSelector: 'h1, h2, h3, h4, h5, h6, p, ol, ul, dl, tr',
  colors: {
    'red': 'hsl(352, 99%, 65%)',
    'orange': 'hsl(31, 99%, 58%)',
    'yellow': 'hsl(50, 98%, 61%)',
    'green': 'hsl(75, 70%, 49%)',
    'blue': 'hsl(182, 86%, 47%)',
  },
  styles: {
    'fill': 'background-color: hsl(from {color} h s l / 40%);',
    'single-underline': 'text-decoration: underline; text-decoration-color: {color}; text-underline-offset: 0.15em; text-decoration-thickness: 0.15em; text-decoration-skip-ink: none;',
    'double-underline': 'text-decoration: underline; text-decoration-color: {color}; text-decoration-style: double;',
    'colored-text': 'color: {color};',
    'redacted': 'background-color: transparent; color: transparent;',
  },
  wrappers: {
    'none': {},
    'sliders': { start: '<span class="slider-start" style="--color: {color}"></span>', end: '<span class="slider-end" style="--color: {color}"></span>', },
    'footnote': { start: '<span class="footnote-marker" data-marker="{marker}" style="--color: {color}"></span>', end: '', },
  },
  rememberStyle: true,
  snapToWord: false,
  pointerMode: 'default',
  defaultColor: 'yellow',
  defaultStyle: 'fill',
  defaultWrapper: 'none',
  highlightIdFunction: hhGetNewHighlightId,
}

console.log('Highlighter loaded');
