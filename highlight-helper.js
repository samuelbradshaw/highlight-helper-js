function Highlighter(options = hhDefaultOptions) {
  for (const key of Object.keys(hhDefaultOptions)) {
    options[key] = options[key] ?? hhDefaultOptions[key];
  }
  const annotatableContainer = document.querySelector(options.containerSelector);
  const annotatableParagraphs = document.querySelectorAll(options.paragraphSelector);
  
  // Set up stylesheets
  const generalStylesheet = new CSSStyleSheet();
  const highlightsStylesheet = new CSSStyleSheet();
  const selectionStylesheet = new CSSStyleSheet();
  document.adoptedStyleSheets.push(generalStylesheet);
  document.adoptedStyleSheets.push(highlightsStylesheet);
  document.adoptedStyleSheets.push(selectionStylesheet);
  generalStylesheet.replaceSync(`
    body {
      -webkit-user-select: none;
      user-select: none;
    }
    ${options.containerSelector} {
      position: relative;
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
    .hh-svg-background {
      position: absolute;
      top: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
    }
    .hh-svg-background g {
      fill: transparent;
      stroke: none;
    }
  `);
  
  // Set up SVG background
  const svgBackground = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgBackground.classList.add('hh-svg-background');
  annotatableContainer.appendChild(svgBackground);
  
  // Setting -1 as the tabIndex on <body> is a workaround to avoid "tap to search" in Chrome on Android. 
  document.body.tabIndex = -1;
  
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isIosSafari = isSafari && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
  const hyperlinks = annotatableContainer.getElementsByTagName('a');
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
    annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightsload', { detail: { addedCount: highlights.length, totalCount: Object.keys(highlightsById).length } }));
  }
  
  // Draw (or redraw) specified highlights, or all highlights on the page
  this.drawHighlights = (highlightIds = Object.keys(highlightsById)) => {
    const annotatableContainerClientRect = annotatableContainer.getBoundingClientRect();
    for (const highlightId of highlightIds) {
      const highlightInfo = highlightsById[highlightId];
      const range = getRestoredHighlightRange(highlightInfo.highlightRange, highlightInfo);
      const wasDrawnAsReadOnly = document.querySelector(`.hh-read-only[data-highlight-id="${highlightId}"]`);
      
      // Remove old highlight elements and styles
      if (!wasDrawnAsReadOnly || (wasDrawnAsReadOnly && !highlightInfo.readOnly)) undrawHighlight(highlightInfo);
      
      if (highlightInfo.readOnly) {
        let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'css');
        highlightsStylesheet.insertRule(`.hh-read-only[data-highlight-id="${highlightId}"] { ${styleTemplate} }`);
        
        // Don't redraw a read-only highlight
        if (wasDrawnAsReadOnly) continue;
        
        // Inject HTML <span> elements
        range.startContainer.splitText(range.startOffset);
        range.endContainer.splitText(range.endOffset);
        const textNodeIter = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
        const relevantTextNodes = [];
        while (node = textNodeIter.nextNode()) {
          if (range.intersectsNode(node) && node !== range.startContainer && node.textContent != '') relevantTextNodes.push(node);
          if (node === range.endContainer) break;
        }
        for (const textNode of relevantTextNodes) {
          const styledSpan = document.createElement('span');
          styledSpan.classList.add('hh-read-only');
          styledSpan.dataset.highlightId = highlightId;
          textNode.before(styledSpan);
          styledSpan.appendChild(textNode);
        }
        document.querySelectorAll(`#${highlightInfo.startParagraphId}, #${highlightInfo.endParagraphId}`).forEach(p => { p.normalize(); });
      } else {        
        // Draw highlights with Custom Highlight API
        if (options.drawingMode == 'highlight-api') {
          if (CSS.highlights.has(highlightId)) {
            highlightObj = CSS.highlights.get(highlightId);
            highlightObj.clear();
          } else {
            highlightObj = new Highlight();
            CSS.highlights.set(highlightId, highlightObj);
          }
          highlightObj.add(range);
          let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'css');
          highlightsStylesheet.insertRule(`::highlight(${highlightInfo.escapedHighlightId}) { ${styleTemplate} }`);
          highlightsStylesheet.insertRule(`rt::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          highlightsStylesheet.insertRule(`sup::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          highlightsStylesheet.insertRule(`sub::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          highlightsStylesheet.insertRule(`img::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
        
        // Draw highlights with SVG shapes
        } else if (options.drawingMode == 'svg') {
          let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'svg');
          let clientRects = range.getClientRects();
          let relevantClientRects = [];
          for (const clientRect of clientRects) {
            if (!isContained(clientRect, relevantClientRects)) relevantClientRects.push(clientRect);
          }
          let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          group.dataset.highlightId = highlightId;
          svgContent = '';
          for (const clientRect of relevantClientRects) {
            svgContent += styleTemplate
            .replaceAll('{x}', clientRect.x - annotatableContainerClientRect.x)
            .replaceAll('{y}', clientRect.y - annotatableContainerClientRect.y)
            .replaceAll('{width}', clientRect.width)
            .replaceAll('{height}', clientRect.height);
          }
          group.innerHTML = svgContent;
          svgBackground.appendChild(group);
        }
      }
    }
  }
  
  // Create a new highlight, or update an existing highlight when it changes
  this.createOrUpdateHighlight = (attributes = {}, triggeredByUserAction = true) => {
    let highlightId = attributes.highlightId ?? activeHighlightId ?? options.highlightIdFunction();
    appearanceChanges = [];
    boundsChanges = [];
    
    let isNewHighlight, oldHighlightInfo;
    if (highlightsById.hasOwnProperty(highlightId)) {
      oldHighlightInfo = highlightsById[highlightId];
    } else {
      isNewHighlight = true;
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
    if ((attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) || selectionRange) {
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
      
      // Create a new highlight range
      highlightRange = document.createRange();
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
      if (options.snapToWord) highlightRange = snapRangeToWord(highlightRange);
      
      // If there are any issues with the range, set the highlight back to how it was
      if (startNode == null || startOffset == null || endNode == null || endOffset == null || startParagraphId == null || startParagraphOffset == null || endParagraphId == null || endParagraphOffset == null || highlightRange.toString() == '') {
        return isNewHighlight ? null : this.createOrUpdateHighlight(oldHighlightInfo);
      }
      
      // Log bounds changes
      for (const key of ['startParagraphId', 'startParagraphOffset', 'endParagraphId', 'endParagraphOffset']) {
        if (isNewHighlight || eval(key) != oldHighlightInfo[key]) boundsChanges.push(key);
      }
    }
    
    // If there are no changes, return
    if (isNewHighlight && boundsChanges.length == 0 || appearanceChanges.length + boundsChanges.length == 0) return;
    
    // Update saved highlight info
    const temporaryHtmlElement = document.createElement('div');
    temporaryHtmlElement.appendChild((highlightRange ?? oldHighlightInfo?.highlightRange).cloneContents());
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
      text: (highlightRange ?? oldHighlightInfo?.highlightRange).toString(),
      html: temporaryHtmlElement.innerHTML,
      escapedHighlightId: CSS.escape(highlightId),
      highlightRange: highlightRange ?? oldHighlightInfo?.highlightRange,
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
            htmlString = htmlString.replaceAll('{color}', options.colors[newHighlightInfo.color]);
            for (const key of Object.keys(newHighlightInfo.wrapperVariables)) {
              htmlString = htmlString.replaceAll(`{${key}}`, newHighlightInfo.wrapperVariables[key]);
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
    } else {
      document.querySelectorAll(`[data-highlight-id="${highlightId}"].hh-wrapper-start, [data-highlight-id="${highlightId}"].hh-wrapper-end`).forEach(el => el.remove());
    }
    
    const detail = {
      highlight: newHighlightInfo,
      changes: appearanceChanges.concat(boundsChanges),
    }
    if (isNewHighlight) {
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightcreate', { detail: detail }));
    } else {
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightupdate', { detail: detail }));
    }
    
    if (triggeredByUserAction) {
      this.drawHighlights([highlightId]);
      if (appearanceChanges.length > 0) updateSelectionStyle(newHighlightInfo.color, newHighlightInfo.style);
      if (highlightId != activeHighlightId) this.activateHighlight(highlightId);
    }
    return newHighlightInfo;
  }
  
  // Activate a highlight by ID
  this.activateHighlight = (highlightId) => {
    // TODO: Show custom selection handles in desktop browser
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    const highlightToActivate = highlightsById[highlightId];
    if (highlightToActivate.readOnly) {
      // If the highlight is read-only, return an event, but don't actually activate it
      return annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
    }
    const highlightRange = highlightToActivate.highlightRange.cloneRange();
    updateSelectionStyle(highlightToActivate.color, highlightToActivate.style);
    if (selection.type != 'Range') {
      selection.removeAllRanges();
      selection.addRange(highlightRange);
    }
    activeHighlightId = highlightId;
    annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
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
    const deactivatedHighlightRange = deactivatedHighlight ? deactivatedHighlight.highlightRange : null;
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
    annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: {
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
      const deletedHighlightInfo = highlightsById[deletedHighlightId];
      this.deactivateHighlights();
      document.querySelectorAll(`.${deletedHighlightInfo.escapedHighlightId}.hh-wrapper-start, .${deletedHighlightInfo.escapedHighlightId}.hh-wrapper-end`).forEach(el => el.remove());
      delete highlightsById[deletedHighlightId];
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightremove', { detail: {
        highlightId: deletedHighlightId,
      }}));
      undrawHighlight(deletedHighlightInfo);
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
    if (key == 'drawingMode') {
      if (CSS.highlights) CSS.highlights.clear();
      this.drawHighlights();
    }
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
    if (activeHighlightId && selection.type == 'Caret' && highlightsById[activeHighlightId].highlightRange.comparePoint(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset) != 0) {
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
  annotatableContainer.addEventListener('pointerdown', respondToTap);
  function respondToTap(event) {
    isStylus = event.pointerType == 'pen';
  }
  
  // Pointer up in annotatable container
  annotatableContainer.addEventListener('pointerup', (event) => {
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
    annotatableContainer.addEventListener('click', (event) => changeSafariFocus(event) );
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
  
  // Window resize
  const respondToWindowResize = (event) => {
    if (options.drawingMode == 'svg') this.drawHighlights();
  }
  window.addEventListener('resize', respondToWindowResize);
  
  
  // -------- UTILITY FUNCTIONS --------
    
  // Check if the selection caret (created when a user taps on text) is in the range of an existing highlight or link. If it is, activate the highlight or link.
  const checkForTapTargets = (selection) => {
    if (selection.type != 'Caret' || (Object.keys(highlightsById).length + hyperlinks.length) == 0) return;
    
    let tapRange = selection.getRangeAt(0);
    const tappedHighlights = [];
    for (const highlightId of Object.keys(highlightsById)) {
      const highlightInfo = highlightsById[highlightId];
      const highlightRange = highlightInfo.highlightRange;
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
      let orderedElementIds = Array.from(annotatableContainer.querySelectorAll('[id]'), node => node.id);
      tappedHighlights.sort((a, b) => {
        return (orderedElementIds.indexOf(a.startParagraphId) - orderedElementIds.indexOf(b.startParagraphId)) || (a.startParagraphOffset - b.startParagraphOffset);
      });
      
      annotatableContainer.dispatchEvent(new CustomEvent('hh:ambiguousaction', { detail: {
        'tapRange': tapRange,
        'highlights': tappedHighlights,
        'hyperlinks': tappedHyperlinks,
      }}));
    }
  }
  
  // Undraw the specified highlight
  const undrawHighlight = (highlightInfo) => {
    const highlightId = highlightInfo.highlightId;
    for (const svgGroup of svgBackground.querySelectorAll(`g[data-highlight-id="${highlightId}"]`)) svgGroup.remove();
    document.querySelectorAll(`.hh-read-only[data-highlight-id="${highlightId}"]`).forEach(span => {
      const parentParagraph = span.closest(options.paragraphSelector);
      const textNode = span.firstChild;
      span.outerHTML = span.innerHTML;
      parentParagraph.normalize();
    });
    if (highlightsById.hasOwnProperty(highlightId)) highlightInfo.highlightRange = getRestoredHighlightRange(highlightInfo.highlightRange, highlightInfo);
    const highlightCssRules = highlightsStylesheet.cssRules;
    const ruleIndexesToDelete = [];
    for (let r = 0; r < highlightCssRules.length; r++) {
      if (highlightCssRules[r].selectorText.includes(`::highlight(${highlightInfo.escapedHighlightId})`) || highlightCssRules[r].selectorText.includes(`[data-highlight-id="${highlightId}"]`)) ruleIndexesToDelete.push(r);
    }
    for (const index of ruleIndexesToDelete.reverse()) highlightsStylesheet.deleteRule(index);
    if (CSS.highlights && CSS.highlights.has(highlightId)) CSS.highlights.delete(highlightId);
  }
  
  // Update the text selection color (to match the highlight color, when a highlight is selected for editing; or, to reset to the default text selection color)
  const updateSelectionStyle = (color, style) => {
    if (color && style) {
      let styleTemplate = getStyleTemplate(color, style, 'css');
      selectionStylesheet.replaceSync(`::selection { ${styleTemplate} }`);
    } else {
      selectionStylesheet.replaceSync(`::selection { background-color: Highlight; }`);
    }
    annotatableContainer.dispatchEvent(new CustomEvent('hh:selectionupdate', { detail: {
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
  
  // Get style template for a given highlight style
  const getStyleTemplate = (color, style, type) => {
    color = color in options.colors ? color : options.defaultColor;
    style = style in options.styles ? style : options.defaultStyle;
    let cssColorString = options.colors[color];
    let cssStyleString = options.styles[style][type].replaceAll('{color}', cssColorString);
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
  
  // Fix highlight range if the DOM changed and made the previous highlight range invalid
  const getRestoredHighlightRange = (highlightRange, highlightInfo) => {
    if (highlightRange.startContainer.nodeType != Node.TEXT_NODE || highlightRange.endContainer.nodeType != Node.TEXT_NODE) {
      ([ startNode, startOffset ] = getTextNodeOffset(document.getElementById(highlightInfo.startParagraphId), highlightInfo.startParagraphOffset));
      ([ endNode, endOffset ] = getTextNodeOffset(document.getElementById(highlightInfo.endParagraphId), highlightInfo.endParagraphOffset));
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
    }
    return highlightRange;
  }
  
  // Convert tap or click to a selection range
  // Adapted from https://stackoverflow.com/a/12924488/1349044
  function getRangeFromTapEvent(event) {
    let range;
    if (document.caretPositionFromPoint) {
      // Most browsers
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
  
  // Check if a DOMRect is contained inside other DOMRects
  // Adapted from https://phuoc.ng/collection/1-loc/check-if-a-given-dom-rect-is-contained-within-another-dom-rect/
  const isContained = (currentRect, otherRects) => {
    for (const otherRect of otherRects) {
      const adjustedCurrentRect = new DOMRect(currentRect.x + 2, currentRect.y + (currentRect.height / 2), currentRect.width - 4, 2);
      if (
        adjustedCurrentRect.left >= otherRect.left &&
        adjustedCurrentRect.left + adjustedCurrentRect.width <= otherRect.left + otherRect.width &&
        adjustedCurrentRect.top >= otherRect.top &&
        adjustedCurrentRect.top + adjustedCurrentRect.height <= otherRect.top + otherRect.height
      ) return true;
    }
    return false;
  }
  
//   // Merge overlapping DOMRects
//   // TODO
//   const mergeDomRects = (rects) => {
//     const linesByYPosition = {}
//     for (const rect of rects) {
//       if (!linesByYPosition.hasOwnProperty(rect.y) {
//         linesByYPosition[rect.y] = { x: rect.x, width: rect.width, height: rect.height }
//       } else {
//         linesByYPosition[rect.y]
//       }
//     }
//   }
  
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
    'fill': {
      'css': 'background-color: hsl(from {color} h s l / 40%);',
      'svg': '<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="hsl(from {color} h s l / 40%)" />',
    },
    'single-underline': {
      'css': 'text-decoration: underline; text-decoration-color: {color}; text-decoration-thickness: 0.15em; text-underline-offset: 0.15em; text-decoration-skip-ink: none;',
      'svg': '<rect x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 6); transform: translateY(calc({height}px * 0.9));" fill="{color}" />',
    },
    'double-underline': {
      'css': 'text-decoration: underline; text-decoration-color: {color}; text-decoration-style: double; text-decoration-skip-ink: none;',
      'svg': '<rect x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 0.8));" fill="{color}" /><rect x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 12); transform: translateY(calc(({height}px * 0.8) + ({height}px / 6)));" fill="{color}" />',
    },
    'colored-text': {
      'css': 'color: {color};',
      'svg': '',
    },
    'redacted': {
      'css': 'background-color: transparent; color: transparent;',
      'svg': '',
    },
  },
  wrappers: {
    'none': {},
    'sliders': { start: '<span class="slider-start" style="--color: {color}"></span>', end: '<span class="slider-end" style="--color: {color}"></span>', },
    'footnote': { start: '<span class="footnote-marker" data-marker="{marker}" style="--color: {color}"></span>', end: '', },
  },
  rememberStyle: true,
  snapToWord: false,
  pointerMode: 'default',
  drawingMode: CSS.highlights ? 'highlight-api' : 'svg',
  defaultColor: 'yellow',
  defaultStyle: 'fill',
  defaultWrapper: 'none',
  highlightIdFunction: hhGetNewHighlightId,
}

console.log('Highlighter loaded');
