/**
 * Copyright (c) 2006-2012, JGraph Ltd
 */
/**
 * Constructs a new graph editor
 */
EditorUi = function(editor, container, lightbox)
{
	mxEventSource.call(this);
	this.destroyFunctions = [];

	this.editor = editor || new Editor();
	this.container = container || document.body;
	var graph = this.editor.graph;
	graph.lightbox = lightbox;

	// Pre-fetches submenu image or replaces with embedded image if supported
	if (mxClient.IS_SVG)
	{
		mxPopupMenu.prototype.submenuImage = 'data:image/gif;base64,R0lGODlhCQAJAIAAAP///zMzMyH5BAEAAAAALAAAAAAJAAkAAAIPhI8WebHsHopSOVgb26AAADs=';
	}
	else
	{
		new Image().src = mxPopupMenu.prototype.submenuImage;
	}

	// Pre-fetches connect image
	if (!mxClient.IS_SVG && mxConnectionHandler.prototype.connectImage != null)
	{
		new Image().src = mxConnectionHandler.prototype.connectImage.src;
	}
	
	// Disables graph and forced panning in chromeless mode
	if (this.editor.chromeless)
	{
		this.footerHeight = 0;
		graph.isEnabled = function() { return false; };
		graph.panningHandler.isForcePanningEvent = function() { return true; };

		// Overrides click handler to ignore graph enabled state
		graph.cellRenderer.createControlClickHandler = function(state)
		{
			var graph = state.view.graph;
			
			return function (evt)
			{
				var collapse = !graph.isCellCollapsed(state.cell);
				graph.foldCells(collapse, false, [state.cell], null, evt);
				mxEvent.consume(evt);
			};
		};
	}
	
    // Creates the user interface
	this.actions = new Actions(this);
	this.menus = new Menus(this);
	this.createDivs();
	this.createUi();
	this.refresh();
	
	// Disables HTML and text selection
	var textEditing =  mxUtils.bind(this, function(evt)
	{
		if (evt == null)
		{
			evt = window.event;
		}
		
		if (this.isSelectionAllowed(evt))
		{
			return true;
		}
		
		return graph.isEditing();
	});

	// Disables text selection while not editing and no dialog visible
	if (this.container == document.body)
	{
		this.menubarContainer.onselectstart = textEditing;
		this.menubarContainer.onmousedown = textEditing;
		this.toolbarContainer.onselectstart = textEditing;
		this.toolbarContainer.onmousedown = textEditing;
		this.diagramContainer.onselectstart = textEditing;
		this.diagramContainer.onmousedown = textEditing;
		this.sidebarContainer.onselectstart = textEditing;
		this.sidebarContainer.onmousedown = textEditing;
		this.formatContainer.onselectstart = textEditing;
		this.formatContainer.onmousedown = textEditing;
		this.footerContainer.onselectstart = textEditing;
		this.footerContainer.onmousedown = textEditing;
		
		if (this.tabContainer != null)
		{
			// Mouse down is needed for drag and drop
			this.tabContainer.onselectstart = textEditing;
		}
	}
	
	// And uses built-in context menu while editing
	if (mxClient.IS_IE && (typeof(document.documentMode) === 'undefined' || document.documentMode < 9))
	{
		mxEvent.addListener(this.diagramContainer, 'contextmenu', textEditing);
	}
	else
	{
		// Allows browser context menu outside of diagram and sidebar
		this.diagramContainer.oncontextmenu = textEditing;
	}

	// Contains the main graph instance inside the given panel
	graph.init(this.diagramContainer);

	// Intercepts links with no target attribute and opens in new window
	graph.cellRenderer.initializeLabel = function(state, shape)
	{
		mxCellRenderer.prototype.initializeLabel.apply(this, arguments);
		
		mxEvent.addListener(shape.node, 'click', function(evt)
		{
			var elt = mxEvent.getSource(evt)
			
			while (elt != null && elt != shape.node)
			{
				if (elt.nodeName == 'A')
				{
					if (elt.getAttribute('target') == null && elt.getAttribute('href') != null)
					{
						window.open(elt.getAttribute('href'));
						mxEvent.consume(evt);
					}

					break;
				}
				
				elt = elt.parentNode;
			}
		});
	};
	
	// Creates hover icons
	this.hoverIcons = this.createHoverIcons();
	
	// Adds tooltip when mouse is over scrollbars to show space-drag panning option
	mxEvent.addListener(this.diagramContainer, 'mousemove', mxUtils.bind(this, function(evt)
	{
		var off = mxUtils.getOffset(this.diagramContainer);
		
		if (mxEvent.getClientX(evt) - off.x - this.diagramContainer.clientWidth > 0 ||
			mxEvent.getClientY(evt) - off.y - this.diagramContainer.clientHeight > 0)
		{
			this.diagramContainer.setAttribute('title', mxResources.get('panTooltip'));
		}
		else
		{
			this.diagramContainer.removeAttribute('title');
		}
	}));

   	// Escape key hides dialogs, adds space+drag panning
	var spaceKeyPressed = false;
	
	// Overrides hovericons to disable while space key is pressed
	var hoverIconsIsResetEvent = this.hoverIcons.isResetEvent;
	
	this.hoverIcons.isResetEvent = function(evt, allowShift)
	{
		return spaceKeyPressed || hoverIconsIsResetEvent.apply(this, arguments);
	};
	
	this.keydownHandler = mxUtils.bind(this, function(evt)
	{
		if (evt.which == 32 /* Space */)
		{
			spaceKeyPressed = true;
			this.hoverIcons.reset();
			graph.container.style.cursor = 'move';
			
			// Disables scroll after space keystroke with scrollbars
			if (!graph.isEditing() && mxEvent.getSource(evt) == graph.container)
			{
				mxEvent.consume(evt);
			}
		}
		else if (!mxEvent.isConsumed(evt) && evt.keyCode == 27 /* Escape */)
		{
			this.hideDialog();
		}
	});
   	
	mxEvent.addListener(document, 'keydown', this.keydownHandler);
	
	this.keyupHandler = mxUtils.bind(this, function(evt)
	{
		graph.container.style.cursor = '';
		spaceKeyPressed = false;
	});

	mxEvent.addListener(document, 'keyup', this.keyupHandler);
    
    // Forces panning for middle and right mouse buttons
	var panningHandlerIsForcePanningEvent = graph.panningHandler.isForcePanningEvent;
	graph.panningHandler.isForcePanningEvent = function(me)
	{
		// Ctrl+left button is reported as right button in FF on Mac
		return panningHandlerIsForcePanningEvent.apply(this, arguments) ||
			spaceKeyPressed || (mxEvent.isMouseEvent(me.getEvent()) &&
			((!mxEvent.isControlDown(me.getEvent()) &&
			mxEvent.isRightMouseButton(me.getEvent())) ||
			mxEvent.isMiddleMouseButton(me.getEvent())));
	};

	// Control-enter applies editing value
	// FIXME: Fix for HTML editing
	var cellEditorIsStopEditingEvent = graph.cellEditor.isStopEditingEvent;
	graph.cellEditor.isStopEditingEvent = function(evt)
	{
		return cellEditorIsStopEditingEvent.apply(this, arguments) ||
			(evt.keyCode == 13 && mxEvent.isControlDown(evt));
	};
	
	// Switches toolbar for text editing
	var textMode = false;
	var fontMenu = null;
	var sizeMenu = null;
	var nodes = null;
	
	var updateToolbar = mxUtils.bind(this, function()
	{
		if (textMode != graph.cellEditor.isContentEditing())
		{
			var node = this.toolbar.container.firstChild;
			var newNodes = [];
			
			while (node != null)
			{
				var tmp = node.nextSibling;
				
				if (mxUtils.indexOf(this.toolbar.staticElements, node) < 0)
				{
					node.parentNode.removeChild(node);
					newNodes.push(node);
				}
				
				node = tmp;
			}
			
			// Saves references to special items
			var tmp1 = this.toolbar.fontMenu;
			var tmp2 = this.toolbar.sizeMenu;
			
			if (nodes == null)
			{
				this.toolbar.createTextToolbar();
			}
			else
			{
				for (var i = 0; i < nodes.length; i++)
				{
					this.toolbar.container.appendChild(nodes[i]);
				}
				
				// Restores references to special items
				this.toolbar.fontMenu = fontMenu;
				this.toolbar.sizeMenu = sizeMenu;
			}
			
			textMode = graph.cellEditor.isContentEditing();
			fontMenu = tmp1;
			sizeMenu = tmp2;
			nodes = newNodes;
		}
	});

	var ui = this;
	
	// Overrides cell editor to update toolbar
	var cellEditorStartEditing = graph.cellEditor.startEditing;
	graph.cellEditor.startEditing = function()
	{
		cellEditorStartEditing.apply(this, arguments);
		updateToolbar();
		
		if (graph.cellEditor.isContentEditing())
		{
			var updating = false;
			
			var updateCssHandler = function()
			{
				if (!updating)
				{
					updating = true;
				
					window.setTimeout(function()
					{
						var selectedElement = graph.getSelectedElement();
						var node = selectedElement;
						
						while (node != null && node.nodeType != mxConstants.NODETYPE_ELEMENT)
						{
							node = node.parentNode;
						}
						
						if (node != null)
						{
							var css = mxUtils.getCurrentStyle(node);
	
							if (css != null && ui.toolbar != null)
							{
								// Strips leading and trailing quotes
								var ff = css.fontFamily;
								
								if (ff.charAt(0) == '\'')
								{
									ff = ff.substring(1);
								}
								
								if (ff.charAt(ff.length - 1) == '\'')
								{
									ff = ff.substring(0, ff.length - 1);
								}
								
								ui.toolbar.setFontName(ff);
								ui.toolbar.setFontSize(parseInt(css.fontSize));
							}
						}
						
						updating = false;
					}, 0);
				}
			};
			
			mxEvent.addListener(graph.cellEditor.textarea, 'input', updateCssHandler)
			mxEvent.addListener(graph.cellEditor.textarea, 'touchend', updateCssHandler);
			mxEvent.addListener(graph.cellEditor.textarea, 'mouseup', updateCssHandler);
			mxEvent.addListener(graph.cellEditor.textarea, 'keyup', updateCssHandler);
			updateCssHandler();
		}
	};
	
	var cellEditorStopEditing = graph.cellEditor.stopEditing;
	graph.cellEditor.stopEditing = function(cell, trigger)
	{
		cellEditorStopEditing.apply(this, arguments);
		updateToolbar();
	};
	
    // Enables scrollbars and sets cursor style for the container
	graph.container.setAttribute('tabindex', '0');
   	graph.container.style.cursor = 'default';
    
	// Workaround for page scroll if embedded via iframe
	if (window.self === window.top)
	{
		graph.container.focus();
	}

   	// Keeps graph container focused on mouse down
   	var graphFireMouseEvent = graph.fireMouseEvent;
   	graph.fireMouseEvent = function(evtName, me, sender)
   	{
   		if (evtName == mxEvent.MOUSE_DOWN)
   		{
   			this.container.focus();
   		}
   		
   		graphFireMouseEvent.apply(this, arguments);
   	};

   	// Configures automatic expand on mouseover
	graph.popupMenuHandler.autoExpand = true;

    // Installs context menu
	graph.popupMenuHandler.factoryMethod = mxUtils.bind(this, function(menu, cell, evt)
	{
		this.menus.createPopupMenu(menu, cell, evt);
	});
	
	// Hides context menu
	mxEvent.addGestureListeners(document, mxUtils.bind(this, function(evt)
	{
		graph.popupMenuHandler.hideMenu();
	}));

    // Create handler for key events
	this.keyHandler = this.createKeyHandler(editor);
    
	// Getter for key handler
	this.getKeyHandler = function()
	{
		return keyHandler;
	};
	
	// Stores the current style and assigns it to new cells
	var styles = ['rounded', 'shadow', 'glass', 'dashed', 'dashPattern', 'comic', 'labelBackgroundColor'];
	var connectStyles = ['shape', 'edgeStyle', 'curved', 'rounded', 'elbow', 'comic'];
	
	// Note: Everything that is not in styles is ignored (styles is augmented below)
	this.setDefaultStyle = function(cell)
	{
		var state = graph.view.getState(cell);
		
		if (state != null)
		{
			// Ignores default styles
			var clone = cell.clone();
			clone.style = ''
			var defaultStyle = graph.getCellStyle(clone);
			var values = [];
			var keys = [];

			for (var key in state.style)
			{
				if (defaultStyle[key] != state.style[key])
				{
					values.push(state.style[key]);
					keys.push(key);
				}
			}
			
			// Handles special case for value "none"
			var cellStyle = graph.getModel().getStyle(state.cell);
			var tokens = (cellStyle != null) ? cellStyle.split(';') : [];
			
			for (var i = 0; i < tokens.length; i++)
			{
				var tmp = tokens[i];
		 		var pos = tmp.indexOf('=');
		 					 		
		 		if (pos >= 0)
		 		{
		 			var key = tmp.substring(0, pos);
		 			var value = tmp.substring(pos + 1);
		 			
		 			if (defaultStyle[key] != null && value == 'none')
		 			{
		 				values.push(value);
		 				keys.push(key);
		 			}
		 		}
			}

			// Resets current style
			if (graph.getModel().isEdge(state.cell))
			{
				graph.currentEdgeStyle = {};
			}
			else
			{
				graph.currentVertexStyle = {}
			}

			this.fireEvent(new mxEventObject('styleChanged', 'keys', keys, 'values', values, 'cells', [state.cell]));
		}
	};
	
	this.clearDefaultStyle = function()
	{
		graph.currentEdgeStyle = graph.defaultEdgeStyle;
		graph.currentVertexStyle = {};
		
		// Updates UI
		this.fireEvent(new mxEventObject('styleChanged', 'keys', [], 'values', [], 'cells', []));
	};

	// Keys that should be ignored if the cell has a value (known: new default for all cells is html=1 so
    // for the html key this effecticely only works for edges inserted via the connection handler)
	var valueStyles = ['fontFamily', 'fontSize', 'fontColor'];
	
	// Keys that always update the current edge style regardless of selection
	var alwaysEdgeStyles = ['edgeStyle', 'startArrow', 'startFill', 'startSize', 'endArrow', 'endFill', 'endSize', 'jettySize', 'orthogonalLoop'];
	
	// Keys that are ignored together (if one appears all are ignored)
	var keyGroups = [['startArrow', 'startFill', 'startSize', 'endArrow', 'endFill', 'endSize', 'jettySize', 'orthogonalLoop'],
	                 ['strokeColor', 'strokeWidth'],
	                 ['fillColor', 'gradientColor'],
	                 valueStyles,
	                 ['align'],
	                 ['html']];
	
	// Adds all keys used above to the styles array
	for (var i = 0; i < keyGroups.length; i++)
	{
		for (var j = 0; j < keyGroups[i].length; j++)
		{
			styles.push(keyGroups[i][j]);
		}
	}
	
	for (var i = 0; i < connectStyles.length; i++)
	{
		styles.push(connectStyles[i]);
	}

	// Implements a global current style for edges and vertices that is applied to new cells
	var insertHandler = function(cells, asText)
	{
		graph.getModel().beginUpdate();
		try
		{
			// Applies only basic text styles
			if (asText)
			{
				var edge = graph.getModel().isEdge(cell);
				var current = (edge) ? graph.currentEdgeStyle : graph.currentVertexStyle;
				var textStyles = ['fontSize', 'fontFamily', 'fontColor'];
				
				for (var j = 0; j < textStyles.length; j++)
				{
					var value = current[textStyles[j]];
					
					if (value != null)
					{
						graph.setCellStyles(textStyles[j], value, cells);
					}
				}
			}
			else
			{
				for (var i = 0; i < cells.length; i++)
				{
					var cell = cells[i];

					// Removes styles defined in the cell style from the styles to be applied
					var cellStyle = graph.getModel().getStyle(cell);
					var tokens = (cellStyle != null) ? cellStyle.split(';') : [];
					var appliedStyles = styles.slice();
					
					for (var j = 0; j < tokens.length; j++)
					{
						var tmp = tokens[j];
				 		var pos = tmp.indexOf('=');
				 					 		
				 		if (pos >= 0)
				 		{
				 			var key = tmp.substring(0, pos);
				 			var index = mxUtils.indexOf(appliedStyles, key);
				 			
				 			if (index >= 0)
				 			{
				 				appliedStyles.splice(index, 1);
				 			}
				 			
				 			// Handles special cases where one defined style ignores other styles
				 			for (var k = 0; k < keyGroups.length; k++)
				 			{
				 				var group = keyGroups[k];
				 				
				 				if (mxUtils.indexOf(group, key) >= 0)
				 				{
				 					for (var l = 0; l < group.length; l++)
				 					{
							 			var index2 = mxUtils.indexOf(appliedStyles, group[l]);
							 			
							 			if (index2 >= 0)
							 			{
							 				appliedStyles.splice(index2, 1);
							 			}
				 					}
				 				}
				 			}
				 		}
					}
	
					// Applies the current style to the cell
					var edge = graph.getModel().isEdge(cell);
					var current = (edge) ? graph.currentEdgeStyle : graph.currentVertexStyle;
					
					for (var j = 0; j < appliedStyles.length; j++)
					{
						var key = appliedStyles[j];
						var styleValue = current[key];
	
						if (styleValue != null && (key != 'shape' || edge))
						{
							// Special case: Connect styles are not applied here but in the connection handler
							if (!edge || mxUtils.indexOf(connectStyles, key) < 0)
							{
								graph.setCellStyles(key, styleValue, [cell]);
							}
						}
					}
				}
			}
		}
		finally
		{
			graph.getModel().endUpdate();
		}
	};

	graph.addListener('cellsInserted', function(sender, evt)
	{
		insertHandler(evt.getProperty('cells'));
	});
	
	graph.addListener('textInserted', function(sender, evt)
	{
		insertHandler(evt.getProperty('cells'), true);
	});
	
	graph.connectionHandler.addListener(mxEvent.CONNECT, function(sender, evt)
	{
		var cells = [evt.getProperty('cell')];
		
		if (evt.getProperty('terminalInserted'))
		{
			cells.push(evt.getProperty('terminal'));
		}
		
		insertHandler(cells);
	});

	this.addListener('styleChanged', mxUtils.bind(this, function(sender, evt)
	{
		// Checks if edges and/or vertices were modified
		var cells = evt.getProperty('cells');
		var vertex = false;
		var edge = false;
		
		if (cells.length > 0)
		{
			for (var i = 0; i < cells.length; i++)
			{
				vertex = graph.getModel().isVertex(cells[i]) || vertex;
				edge = graph.getModel().isEdge(cells[i]) || edge;
				
				if (edge && vertex)
				{
					break;
				}
			}
		}
		else
		{
			vertex = true;
			edge = true;
		}
		
		var keys = evt.getProperty('keys');
		var values = evt.getProperty('values');

		for (var i = 0; i < keys.length; i++)
		{
			var common = mxUtils.indexOf(valueStyles, keys[i]) >= 0;
			
			// Ignores transparent stroke colors
			if (keys[i] != 'strokeColor' || (values[i] != null && values[i] != 'none'))
			{
				// Special case: Edge style and shape
				if (mxUtils.indexOf(connectStyles, keys[i]) >= 0)
				{
					if (edge || mxUtils.indexOf(alwaysEdgeStyles, keys[i]) >= 0)
					{
						if (values[i] == null)
						{
							delete graph.currentEdgeStyle[keys[i]];
						}
						else
						{
							graph.currentEdgeStyle[keys[i]] = values[i];
						}
					}
					// Uses style for vertex if defined in styles
					else if (vertex && mxUtils.indexOf(styles, keys[i]) >= 0)
					{
						if (values[i] == null)
						{
							delete graph.currentVertexStyle[keys[i]];
						}
						else
						{
							graph.currentVertexStyle[keys[i]] = values[i];
						}
					}
				}
				else if (mxUtils.indexOf(styles, keys[i]) >= 0)
				{
					if (vertex || common)
					{
						if (values[i] == null)
						{
							delete graph.currentVertexStyle[keys[i]];
						}
						else
						{
							graph.currentVertexStyle[keys[i]] = values[i];
						}
					}
					
					if (edge || common || mxUtils.indexOf(alwaysEdgeStyles, keys[i]) >= 0)
					{
						if (values[i] == null)
						{
							delete graph.currentEdgeStyle[keys[i]];
						}
						else
						{
							graph.currentEdgeStyle[keys[i]] = values[i];
						}
					}
				}
			}
		}
		
		if (this.toolbar != null)
		{
			this.toolbar.setFontName(graph.currentVertexStyle['fontFamily'] || Menus.prototype.defaultFont);
			this.toolbar.setFontSize(graph.currentVertexStyle['fontSize'] || Menus.prototype.defaultFontSize);
			
			if (this.toolbar.edgeStyleMenu != null)
			{
				// Updates toolbar icon for edge style
				var edgeStyleDiv = this.toolbar.edgeStyleMenu.getElementsByTagName('div')[0];

				if (graph.currentEdgeStyle['edgeStyle'] == 'orthogonalEdgeStyle' && graph.currentEdgeStyle['curved'] == '1')
				{
					edgeStyleDiv.className = 'geSprite geSprite-curved';
				}
				else if (graph.currentEdgeStyle['edgeStyle'] == 'straight' || graph.currentEdgeStyle['edgeStyle'] == 'none' ||
						graph.currentEdgeStyle['edgeStyle'] == null)
				{
					edgeStyleDiv.className = 'geSprite geSprite-straight';
				}
				else if (graph.currentEdgeStyle['edgeStyle'] == 'entityRelationEdgeStyle')
				{
					edgeStyleDiv.className = 'geSprite geSprite-entity';
				}
				else
				{
					edgeStyleDiv.className = 'geSprite geSprite-orthogonal';
				}
			}
			
			if (this.toolbar.edgeShapeMenu != null)
			{
				// Updates icon for edge shape
				var edgeShapeDiv = this.toolbar.edgeShapeMenu.getElementsByTagName('div')[0];
				
				if (graph.currentEdgeStyle['shape'] == 'link')
				{
					edgeShapeDiv.className = 'geSprite geSprite-linkedge';
				}
				else if (graph.currentEdgeStyle['shape'] == 'flexArrow')
				{
					edgeShapeDiv.className = 'geSprite geSprite-arrow';
				}
				else if (graph.currentEdgeStyle['shape'] == 'arrow')
				{
					edgeShapeDiv.className = 'geSprite geSprite-simplearrow';
				}
				else
				{
					edgeShapeDiv.className = 'geSprite geSprite-connection';
				}
			}
			
			// Updates icon for optinal line start shape
			if (this.toolbar.lineStartMenu != null)
			{
				var lineStartDiv = this.toolbar.lineStartMenu.getElementsByTagName('div')[0];
				
				lineStartDiv.className = this.getCssClassForMarker('start',
						graph.currentEdgeStyle['shape'], graph.currentEdgeStyle[mxConstants.STYLE_STARTARROW],
						mxUtils.getValue(graph.currentEdgeStyle, 'startFill', '1'));
			}

			// Updates icon for optinal line end shape
			if (this.toolbar.lineEndMenu != null)
			{
				var lineEndDiv = this.toolbar.lineEndMenu.getElementsByTagName('div')[0];
				
				lineEndDiv.className = this.getCssClassForMarker('end',
						graph.currentEdgeStyle['shape'], graph.currentEdgeStyle[mxConstants.STYLE_ENDARROW],
						mxUtils.getValue(graph.currentEdgeStyle, 'endFill', '1'));
			}
		}
	}));
	
	// Update font size and font family labels
	if (this.toolbar != null)
	{
		var update = mxUtils.bind(this, function()
		{
			var ff = graph.currentVertexStyle['fontFamily'] || 'Helvetica';
			var fs = String(graph.currentVertexStyle['fontSize'] || '12');
	    	var state = graph.getView().getState(graph.getSelectionCell());
	    	
	    	if (state != null)
	    	{
	    		ff = state.style[mxConstants.STYLE_FONTFAMILY] || ff;
	    		fs = state.style[mxConstants.STYLE_FONTSIZE] || fs;
	    		
	    		if (ff.length > 10)
	    		{
	    			ff = ff.substring(0, 8) + '...';
	    		}
	    	}
	    	
	    	this.toolbar.setFontName(ff);
	    	this.toolbar.setFontSize(fs);
		});
		
	    graph.getSelectionModel().addListener(mxEvent.CHANGE, update);
	    graph.getModel().addListener(mxEvent.CHANGE, update);
	}
	
	// Makes sure the current layer is visible when cells are added
	graph.addListener(mxEvent.CELLS_ADDED, function(sender, evt)
	{
		var cells = evt.getProperty('cells');
		var parent = evt.getProperty('parent');
		
		if (graph.getModel().isLayer(parent) && !graph.isCellVisible(parent) && cells != null && cells.length > 0)
		{
			graph.getModel().setVisible(parent, true);
		}
	});
	
	// Global handler to hide the current menu
	this.gestureHandler = mxUtils.bind(this, function(evt)
	{
		if (this.currentMenu != null && mxEvent.getSource(evt) != this.currentMenu.div)
		{
			this.hideCurrentMenu();
		}
	});
	
	mxEvent.addGestureListeners(document, this.gestureHandler);

	// Updates the editor UI after the window has been resized or the orientation changes
	// Timeout is workaround for old IE versions which have a delay for DOM client sizes.
	// Should not use delay > 0 to avoid handle multiple repaints during window resize
	this.resizeHandler = mxUtils.bind(this, function()
   	{
   		window.setTimeout(mxUtils.bind(this, function()
   		{
   			this.refresh();
   		}), 0);
   	});
	
   	mxEvent.addListener(window, 'resize', this.resizeHandler);
   	
   	this.orientationChangeHandler = mxUtils.bind(this, function()
   	{
   		this.refresh();
   	});
   	
   	mxEvent.addListener(window, 'orientationchange', this.orientationChangeHandler);
   	
	// Workaround for bug on iOS see
	// http://stackoverflow.com/questions/19012135/ios-7-ipad-safari-landscape-innerheight-outerheight-layout-issue
	if (mxClient.IS_IOS && !window.navigator.standalone)
	{
		this.scrollHandler = mxUtils.bind(this, function()
	   	{
	   		window.scrollTo(0, 0);
	   	});
		
	   	mxEvent.addListener(window, 'scroll', this.scrollHandler);
	}

	/**
	 * Sets the initial scrollbar locations after a file was loaded.
	 */
	this.editor.addListener('resetGraphView', mxUtils.bind(this, function()
	{
		this.resetScrollbars();
	}));
	
	/**
	 * Repaints the grid.
	 */
	this.addListener('gridEnabledChanged', mxUtils.bind(this, function()
	{
		graph.view.validateBackground();
	}));
	
	this.addListener('backgroundColorChanged', mxUtils.bind(this, function()
	{
		graph.view.validateBackground();
	}));

	/**
	 * Repaints the grid.
	 */
	graph.addListener('gridSizeChanged', mxUtils.bind(this, function()
	{
		if (graph.isGridEnabled())
		{
			graph.view.validateBackground();
		}
	}));

   	// Resets UI, updates action and menu states
   	this.editor.resetGraph();
   	this.init();
   	this.open();
};

// Extends mxEventSource
mxUtils.extend(EditorUi, mxEventSource);

/**
 * Global config that specifies if the compact UI elements should be used.
 */
EditorUi.compactUi = true;

/**
 * Specifies the size of the split bar.
 */
EditorUi.prototype.splitSize = (mxClient.IS_TOUCH || mxClient.IS_POINTER) ? 12 : 8;

/**
 * Specifies the height of the menubar. Default is 34.
 */
EditorUi.prototype.menubarHeight = 30;

/**
 * Specifies the width of the format panel should be enabled. Default is true.
 */
EditorUi.prototype.formatEnabled = true;

/**
 * Specifies the width of the format panel. Default is 240.
 */
EditorUi.prototype.formatWidth = 240;

/**
 * Specifies the height of the toolbar. Default is 36.
 */
EditorUi.prototype.toolbarHeight = 34;

/**
 * Specifies the height of the footer. Default is 28.
 */
EditorUi.prototype.footerHeight = 28;

/**
 * Specifies the height of the optional sidebarFooterContainer. Default is 34.
 */
EditorUi.prototype.sidebarFooterHeight = 34;

/**
 * Specifies the link for the edit button in chromeless mode.
 */
EditorUi.prototype.editButtonLink = null;

/**
 * Specifies the position of the horizontal split bar. Default is 204 or 120 for
 * screen widths <= 500px.
 */
EditorUi.prototype.hsplitPosition = (screen.width <= 500) ? 116 : 204;

/**
 * Specifies if animations are allowed in <executeLayout>. Default is true.
 */
EditorUi.prototype.allowAnimation = true;

/**
 * 
 */
EditorUi.prototype.editBlankUrl = window.location.protocol + '//' + window.location.host + '/?client=1';

/**
 * 
 */
EditorUi.prototype.editBlankFallbackUrl = window.location.protocol + '//' + window.location.host + '/?create=drawdata&splash=0';

/**
 * Installs the listeners to update the action states.
 */
EditorUi.prototype.init = function()
{
	/**
	 * Keypress starts immediate editing on selection cell
	 */
	var graph = this.editor.graph;
		
	mxEvent.addListener(graph.container, 'keydown', mxUtils.bind(this, function(evt)
	{
		// Tab selects next cell
		if (evt.which == 9 && graph.isEnabled())
		{
			if (graph.isEditing())
			{
				graph.stopEditing(false);
			}
			
			graph.selectCell(!mxEvent.isShiftDown(evt));
			mxEvent.consume(evt);
		}
	}));
	
	mxEvent.addListener(graph.container, 'keypress', mxUtils.bind(this, function(evt)
	{
		// KNOWN: Focus does not work if label is empty in quirks mode
		if (this.isImmediateEditingEvent(evt) && !graph.isEditing() && !graph.isSelectionEmpty() && evt.which !== 0 &&
			!mxEvent.isAltDown(evt) && !mxEvent.isControlDown(evt) && !mxEvent.isMetaDown(evt))
		{
			graph.escape();
			graph.startEditing();

			// Workaround for FF where char is lost if cursor is placed before char
			if (mxClient.IS_FF)
			{
				var ce = graph.cellEditor;
				ce.textarea.innerHTML = String.fromCharCode(evt.which);

				// Moves cursor to end of textarea
				var range = document.createRange();
				range.selectNodeContents(ce.textarea);
				range.collapse(false);
				var sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange(range);
			}
		}
	}));

	// Updates action states
	this.addUndoListener();
	this.addBeforeUnloadListener();
	
	graph.getSelectionModel().addListener(mxEvent.CHANGE, mxUtils.bind(this, function()
	{
		this.updateActionStates();
	}));
	
	graph.getModel().addListener(mxEvent.CHANGE, mxUtils.bind(this, function()
	{
		this.updateActionStates();
	}));
	
	// Changes action states after change of default parent
	var graphSetDefaultParent = graph.setDefaultParent;
	var ui = this;
	
	this.editor.graph.setDefaultParent = function()
	{
		graphSetDefaultParent.apply(this, arguments);
		ui.updateActionStates();
	};
	
	// Hack to make editLink available in vertex handler
	graph.editLink = ui.actions.get('editLink').funct;
	
	this.updateActionStates();
	this.initClipboard();
	this.initCanvas();
	
	if (this.format != null)
	{
		this.format.init();
	}
};

/**
 * Returns true if the given event should start editing. This implementation returns true.
 */
EditorUi.prototype.isImmediateEditingEvent = function(evt)
{
	return true;
};

/**
 * Private helper method.
 */
EditorUi.prototype.getCssClassForMarker = function(prefix, shape, marker, fill)
{
	var result = '';

	if (shape == 'flexArrow')
	{
		result = (marker != null && marker != mxConstants.NONE) ?
			'geSprite geSprite-' + prefix + 'blocktrans' : 'geSprite geSprite-noarrow';
	}
	else
	{
		if (marker == mxConstants.ARROW_CLASSIC)
		{
			result = (fill == '1') ? 'geSprite geSprite-' + prefix + 'classic' : 'geSprite geSprite-' + prefix + 'classictrans';
		}
		else if (marker == mxConstants.ARROW_CLASSIC_THIN)
		{
			result = (fill == '1') ? 'geSprite geSprite-' + prefix + 'classicthin' : 'geSprite geSprite-' + prefix + 'classicthintrans';
		}
		else if (marker == mxConstants.ARROW_OPEN)
		{
			result = 'geSprite geSprite-' + prefix + 'open';
		}
		else if (marker == mxConstants.ARROW_OPEN_THIN)
		{
			result = 'geSprite geSprite-' + prefix + 'openthin';
		}
		else if (marker == mxConstants.ARROW_BLOCK)
		{
			result = (fill == '1') ? 'geSprite geSprite-' + prefix + 'block' : 'geSprite geSprite-' + prefix + 'blocktrans';
		}
		else if (marker == mxConstants.ARROW_BLOCK_THIN)
		{
			result = (fill == '1') ? 'geSprite geSprite-' + prefix + 'blockthin' : 'geSprite geSprite-' + prefix + 'blockthintrans';
		}
		else if (marker == mxConstants.ARROW_OVAL)
		{
			result = (fill == '1') ? 'geSprite geSprite-' + prefix + 'oval' : 'geSprite geSprite-' + prefix + 'ovaltrans';
		}
		else if (marker == mxConstants.ARROW_DIAMOND)
		{
			result = (fill == '1') ? 'geSprite geSprite-' + prefix + 'diamond' : 'geSprite geSprite-' + prefix + 'diamondtrans';
		}
		else if (marker == mxConstants.ARROW_DIAMOND_THIN)
		{
			result = (fill == '1') ? 'geSprite geSprite-' + prefix + 'thindiamond' : 'geSprite geSprite-' + prefix + 'thindiamondtrans';
		}
		else if (marker == 'openAsync')
		{
			result = 'geSprite geSprite-' + prefix + 'openasync';
		}
		else if (marker == 'dash')
		{
			result = 'geSprite geSprite-' + prefix + 'dash';
		}
		else if (marker == 'cross')
		{
			result = 'geSprite geSprite-' + prefix + 'cross';
		}
		else if (marker == 'async')
		{
			result = (fill == '1') ? 'geSprite geSprite-' + prefix + 'async' : 'geSprite geSprite-' + prefix + 'asynctrans';
		}
		else if (marker == 'circle' || marker == 'circlePlus')
		{
			result = (fill == '1' || marker == 'circle') ? 'geSprite geSprite-' + prefix + 'circle' : 'geSprite geSprite-' + prefix + 'circleplus';
		}
		else if (marker == 'ERone')
		{
			result = 'geSprite geSprite-' + prefix + 'erone';
		}
		else if (marker == 'ERmandOne')
		{
			result = 'geSprite geSprite-' + prefix + 'eronetoone';
		}
		else if (marker == 'ERmany')
		{
			result = 'geSprite geSprite-' + prefix + 'ermany';
		}
		else if (marker == 'ERoneToMany')
		{
			result = 'geSprite geSprite-' + prefix + 'eronetomany';
		}
		else if (marker == 'ERzeroToOne')
		{
			result = 'geSprite geSprite-' + prefix + 'eroneopt';
		}
		else if (marker == 'ERzeroToMany')
		{
			result = 'geSprite geSprite-' + prefix + 'ermanyopt';
		}
		else
		{
			result = 'geSprite geSprite-noarrow';
		}
	}

	return result;
};

/**
 * Hook for allowing selection and context menu for certain events.
 */
EditorUi.prototype.updatePasteActionStates = function()
{
	var graph = this.editor.graph;
	var paste = this.actions.get('paste');
	var pasteHere = this.actions.get('pasteHere');
	
	paste.setEnabled(this.editor.graph.cellEditor.isContentEditing() || (!mxClipboard.isEmpty() &&
		graph.isEnabled() && !graph.isCellLocked(graph.getDefaultParent())));
	pasteHere.setEnabled(paste.isEnabled());
};

/**
 * Hook for allowing selection and context menu for certain events.
 */
EditorUi.prototype.initClipboard = function()
{
	var ui = this;

	var mxClipboardCut = mxClipboard.cut;
	mxClipboard.cut = function(graph)
	{
		if (graph.cellEditor.isContentEditing())
		{
			document.execCommand('cut', false, null);
		}
		else
		{
			mxClipboardCut.apply(this, arguments);
		}
		
		ui.updatePasteActionStates();
	};
	
	var mxClipboardCopy = mxClipboard.copy;
	mxClipboard.copy = function(graph)
	{
		if (graph.cellEditor.isContentEditing())
		{
			document.execCommand('copy', false, null);
		}
		else
		{
			mxClipboardCopy.apply(this, arguments);
		}
		
		ui.updatePasteActionStates();
	};
	
	var mxClipboardPaste = mxClipboard.paste;
	mxClipboard.paste = function(graph)
	{
		var result = null;
		
		if (graph.cellEditor.isContentEditing())
		{
			document.execCommand('paste', false, null);
		}
		else
		{
			result = mxClipboardPaste.apply(this, arguments);
		}
		
		ui.updatePasteActionStates();
		
		return result;
	};

	// Overrides cell editor to update paste action state
	var cellEditorStartEditing = this.editor.graph.cellEditor.startEditing;
	
	this.editor.graph.cellEditor.startEditing = function()
	{
		cellEditorStartEditing.apply(this, arguments);
		ui.updatePasteActionStates();
	};
	
	var cellEditorStopEditing = this.editor.graph.cellEditor.stopEditing;
	
	this.editor.graph.cellEditor.stopEditing = function(cell, trigger)
	{
		cellEditorStopEditing.apply(this, arguments);
		ui.updatePasteActionStates();
	};
	
	this.updatePasteActionStates();
};

/**
 * Initializes the infinite canvas.
 */
EditorUi.prototype.initCanvas = function()
{
	var graph = this.editor.graph;

	// Initial page layout view, scrollBuffer and timer-based scrolling
	var graph = this.editor.graph;
	graph.timerAutoScroll = true;
	
	/**
	 * Specifies the size of the size for "tiles" to be used for a graph with
	 * scrollbars but no visible background page. A good value is large
	 * enough to reduce the number of repaints that is caused for auto-
	 * translation, which depends on this value, and small enough to give
	 * a small empty buffer around the graph. Default is 400x400.
	 */
	graph.scrollTileSize = new mxRectangle(0, 0, 400, 400);
	
	/**
	 * Returns the padding for pages in page view with scrollbars.
	 */
	graph.getPagePadding = function()
	{
		return new mxPoint(Math.max(0, Math.round((graph.container.offsetWidth - 34) / graph.view.scale)),
				Math.max(0, Math.round((graph.container.offsetHeight - 34) / graph.view.scale)));
	};
	
	/**
	 * Returns the size of the page format scaled with the page size.
	 */
	graph.getPageSize = function()
	{
		return (this.pageVisible) ? new mxRectangle(0, 0, this.pageFormat.width * this.pageScale,
				this.pageFormat.height * this.pageScale) : this.scrollTileSize;
	};
	
	/**
	 * Returns a rectangle describing the position and count of the
	 * background pages, where x and y are the position of the top,
	 * left page and width and height are the vertical and horizontal
	 * page count.
	 */
	graph.getPageLayout = function()
	{
		var size = (this.pageVisible) ? this.getPageSize() : this.scrollTileSize;
		var bounds = this.getGraphBounds();

		if (bounds.width == 0 || bounds.height == 0)
		{
			return new mxRectangle(0, 0, 1, 1);
		}
		else
		{
			// Computes untransformed graph bounds
			var x = Math.ceil(bounds.x / this.view.scale - this.view.translate.x);
			var y = Math.ceil(bounds.y / this.view.scale - this.view.translate.y);
			var w = Math.floor(bounds.width / this.view.scale);
			var h = Math.floor(bounds.height / this.view.scale);
			
			var x0 = Math.floor(x / size.width);
			var y0 = Math.floor(y / size.height);
			var w0 = Math.ceil((x + w) / size.width) - x0;
			var h0 = Math.ceil((y + h) / size.height) - y0;
			
			return new mxRectangle(x0, y0, w0, h0);
		}
	};

	// Fits the number of background pages to the graph
	graph.view.getBackgroundPageBounds = function()
	{
		var layout = this.graph.getPageLayout();
		var page = this.graph.getPageSize();
		
		return new mxRectangle(this.scale * (this.translate.x + layout.x * page.width),
				this.scale * (this.translate.y + layout.y * page.height),
				this.scale * layout.width * page.width,
				this.scale * layout.height * page.height);
	};

	graph.getPreferredPageSize = function(bounds, width, height)
	{
		var pages = this.getPageLayout();
		var size = this.getPageSize();
		
		return new mxRectangle(0, 0, pages.width * size.width, pages.height * size.height);
	};
	
	// Scales pages/graph to fit available size
	var resize = null;
	
	if (this.editor.chromeless)
	{
		resize = mxUtils.bind(this, function(autoscale)
	   	{
			if (graph.container != null)
			{
				var b = (graph.pageVisible) ? graph.view.getBackgroundPageBounds() : graph.getGraphBounds();
				var tr = graph.view.translate;
				var s = graph.view.scale;
				
				// Normalizes the bounds
				b = mxRectangle.fromRectangle(b);
				b.x = b.x / s - tr.x;
				b.y = b.y / s - tr.y;
				b.width /= s;
				b.height /= s;
				
				var st = graph.container.scrollTop;
				var sl = graph.container.scrollLeft;
				var sb = (mxClient.IS_QUIRKS || document.documentMode >= 8) ? 20 : 14;
				
				if (document.documentMode == 8 || document.documentMode == 9)
				{
					sb += 3;
				}
				
				var cw = graph.container.offsetWidth - sb;
				var ch = graph.container.offsetHeight - sb;
				
				var ns = (autoscale) ? Math.max(0.3, Math.min(1, cw / b.width)) : s;
				var dx = Math.max((cw - ns * b.width) / 2, 0) / ns;
				var dy = Math.max((ch - ns * b.height) / 4, 0) / ns;
				
				graph.view.scaleAndTranslate(ns, dx - b.x, dy - b.y);

				graph.container.scrollTop = st * ns / s;
				graph.container.scrollLeft = sl * ns/ s;
			}
	   	});
		
		// Hack to make function available to subclassers
		this.chromelessResize = resize;

		// Removable resize listener
		var autoscaleResize = mxUtils.bind(this, function()
	   	{
			resize(false);
	   	});
		
	   	mxEvent.addListener(window, 'resize', autoscaleResize);
	   	
	   	this.destroyFunctions.push(function()
	   	{
	   		mxEvent.removeListener(window, 'resize', autoscaleResize);
	   	});
	   	
		this.editor.addListener('resetGraphView', mxUtils.bind(this, function()
		{
			resize(true);
		}));

		this.actions.get('zoomIn').funct = function(evt) { graph.zoomIn(); resize(false); };
		this.actions.get('zoomOut').funct = function(evt) { graph.zoomOut(); resize(false); };
		
		// Creates toolbar for viewer - do not use CSS here
		// as this may be used in a viewer that has no CSS
		this.chromelessToolbar = document.createElement('div');
		this.chromelessToolbar.className = 'noPrint';
		this.chromelessToolbar.style.position = 'fixed';
		this.chromelessToolbar.style.overflow = 'hidden';
		this.chromelessToolbar.style.boxSizing = 'border-box';
		this.chromelessToolbar.style.whiteSpace = 'nowrap';
		this.chromelessToolbar.style.backgroundColor = '#000000';
		this.chromelessToolbar.style.padding = '10px 10px 8px 10px';
		this.chromelessToolbar.style.bottom = '50px';
		this.chromelessToolbar.style.left = '50%';
		
		mxUtils.setPrefixedStyle(this.chromelessToolbar.style, 'borderRadius', '20px');
		var btnCount = 0;

		var addButton = mxUtils.bind(this, function(fn, imgSrc, tip)
		{
			btnCount++;
			
			var a = document.createElement('a');
			a.setAttribute('href', 'javascript:void(0);');
			a.style.paddingLeft = '8px';
			a.style.paddingRight = '8px';
			mxEvent.addListener(a, 'click', fn);
			
			if (tip != null)
			{
				a.setAttribute('title', tip);
			}
			
			var img = document.createElement('img');
			img.setAttribute('src', imgSrc);
			
			a.appendChild(img);
			this.chromelessToolbar.appendChild(a);
		});

		addButton(mxUtils.bind(this, function(evt)
		{
			this.actions.get('zoomOut').funct();
			mxEvent.consume(evt);
		}), Editor.zoomOutLargeImage, (mxResources.get('zoomIn') || 'Zoom In') + ' (Alt+Mousewheel)');
		
		addButton(mxUtils.bind(this, function(evt)
		{
			this.actions.get('zoomIn').funct();
			mxEvent.consume(evt);
		}), Editor.zoomInLargeImage, (mxResources.get('zoomOut') || 'Zoom Out') + ' (Alt+Mousewheel)');
		
		addButton(mxUtils.bind(this, function(evt)
		{
			if (graph.lightbox)
			{
				if (graph.view.scale == 1)
				{
					this.lightboxFit();
				}
				else
				{
					graph.zoomTo(1);
				}
				
				resize(false);
			}
			else
			{
				resize(true);
			}
			
			mxEvent.consume(evt);
		}), Editor.actualSizeLargeImage, mxResources.get('fit') || 'Fit');

		if (this.editButtonLink != null)
		{
			addButton(mxUtils.bind(this, function(evt)
			{
				if (this.editButtonLink == '_blank')
				{
					this.editAsNew(this.getEditBlankXml(), null, true);
				}
				else
				{
					window.open(this.editButtonLink, 'editWindow');
				}
				
				mxEvent.consume(evt);
			}), Editor.editLargeImage, (mxResources.get('edit') || 'Edit') + ' (Escape)');
		}
		
		if (urlParams['close'] == '1' || (graph.lightbox && this.container != document.body))
		{
			addButton(mxUtils.bind(this, function(evt)
			{
				if (urlParams['close'] == '1')
				{
					window.close();
				}
				else
				{
					this.destroy();
					mxEvent.consume(evt);
				}
			}), Editor.closeLargeImage, mxResources.get('close') || 'Close');
		}
		
		graph.container.appendChild(this.chromelessToolbar);
		this.chromelessToolbar.style.marginLeft = -(btnCount * 24 + 10) + 'px';

		// Changes toolbar opacity on hover
		if (!mxClient.IS_TOUCH)
		{
			var fadeThread = null;
			
			mxEvent.addListener(graph.container, 'mousemove', mxUtils.bind(this, function(evt)
			{
				if (fadeThread != null)
				{
					window.clearTimeout(fadeThread);
				}
				
				fadeThread = window.setTimeout(mxUtils.bind(this, function()
				{
				 	mxUtils.setPrefixedStyle(this.chromelessToolbar.style, 'transition', 'all 1000ms ease-in-out');
				 	mxUtils.setOpacity(this.chromelessToolbar, 0);
					fadeThread = null;
				}), 200);
				
				mxUtils.setPrefixedStyle(this.chromelessToolbar.style, 'transition', null);
				mxUtils.setOpacity(this.chromelessToolbar, 30);
			}));
			
			mxEvent.addListener(this.chromelessToolbar, 'mouseenter', mxUtils.bind(this, function(evt)
			{
				mxUtils.setOpacity(this.chromelessToolbar, 100);
				
				if (fadeThread != null)
				{
					window.clearTimeout(fadeThread);
					fadeThread = null;
				}
			}));
	
			mxEvent.addListener(this.chromelessToolbar, 'mousemove',  mxUtils.bind(this, function(evt)
			{
				mxUtils.setOpacity(this.chromelessToolbar, 100);
				mxEvent.consume(evt);
			}));
	
			mxEvent.addListener(this.chromelessToolbar, 'mouseleave',  mxUtils.bind(this, function(evt)
			{
				mxUtils.setOpacity(this.chromelessToolbar, 30);
			}));
			
			mxUtils.setOpacity(this.chromelessToolbar, 30);
		}
		else
		{
			// TODO: Show/hide on touch
			mxUtils.setOpacity(this.chromelessToolbar, 50);
		}
	}
	else if (this.editor.extendCanvas)
	{
		/**
		 * Guesses autoTranslate to avoid another repaint (see below).
		 * Works if only the scale of the graph changes or if pages
		 * are visible and the visible pages do not change.
		 */
		var graphViewValidate = graph.view.validate;
		graph.view.validate = function()
		{
			if (this.graph.container != null && mxUtils.hasScrollbars(this.graph.container))
			{
				var pad = this.graph.getPagePadding();
				var size = this.graph.getPageSize();
				
				// Updating scrollbars here causes flickering in quirks and is not needed
				// if zoom method is always used to set the current scale on the graph.
				var tx = this.translate.x;
				var ty = this.translate.y;
				this.translate.x = pad.x - (this.x0 || 0) * size.width;
				this.translate.y = pad.y - (this.y0 || 0) * size.height;
			}
			
			graphViewValidate.apply(this, arguments);
		};
		
		var graphSizeDidChange = graph.sizeDidChange;
		graph.sizeDidChange = function()
		{
			if (this.container != null && mxUtils.hasScrollbars(this.container))
			{
				var pages = this.getPageLayout();
				var pad = this.getPagePadding();
				var size = this.getPageSize();
				
				// Updates the minimum graph size
				var minw = Math.ceil(2 * pad.x + pages.width * size.width);
				var minh = Math.ceil(2 * pad.y + pages.height * size.height);
				
				var min = graph.minimumGraphSize;
				
				// LATER: Fix flicker of scrollbar size in IE quirks mode
				// after delayed call in window.resize event handler
				if (min == null || min.width != minw || min.height != minh)
				{
					graph.minimumGraphSize = new mxRectangle(0, 0, minw, minh);
				}
				
				// Updates auto-translate to include padding and graph size
				var dx = pad.x - pages.x * size.width;
				var dy = pad.y - pages.y * size.height;
				
				if (!this.autoTranslate && (this.view.translate.x != dx || this.view.translate.y != dy))
				{
					this.autoTranslate = true;
					this.view.x0 = pages.x;
					this.view.y0 = pages.y;

					// NOTE: THIS INVOKES THIS METHOD AGAIN. UNFORTUNATELY THERE IS NO WAY AROUND THIS SINCE THE
					// BOUNDS ARE KNOWN AFTER THE VALIDATION AND SETTING THE TRANSLATE TRIGGERS A REVALIDATION.
					// SHOULD MOVE TRANSLATE/SCALE TO VIEW.
					var tx = graph.view.translate.x;
					var ty = graph.view.translate.y;
					graph.view.setTranslate(dx, dy);
					
					// LATER: Fix rounding errors for small zoom
					graph.container.scrollLeft += Math.round((dx - tx) * graph.view.scale);
					graph.container.scrollTop += Math.round((dy - ty) * graph.view.scale);
					
					this.autoTranslate = false;
					
					return;
				}

				graphSizeDidChange.apply(this, arguments);
			}
		};
	}
	
	// Accumulates the zoom factor while the rendering is taking place
	// so that not the complete sequence of zoom steps must be painted
	graph.updateZoomTimeout = null;
	graph.cumulativeZoomFactor = 1;
	
	graph.lazyZoom = function(zoomIn)
	{
		if (this.updateZoomTimeout != null)
		{
			window.clearTimeout(this.updateZoomTimeout);
		}

		// Switches to 1% zoom steps below 15%
		// Lower bound depdends on rounding below
		if (zoomIn)
		{
			if (this.view.scale * this.cumulativeZoomFactor < 0.15)
			{
				this.cumulativeZoomFactor = (this.view.scale + 0.01) / this.view.scale;
			}
			else
			{
				// Uses to 5% zoom steps for better grid rendering in webkit
				// and to avoid rounding errors for zoom steps
				this.cumulativeZoomFactor *= this.zoomFactor;
				this.cumulativeZoomFactor = Math.round(this.view.scale * this.cumulativeZoomFactor * 20) / 20 / this.view.scale;
			}
		}
		else
		{
			if (this.view.scale * this.cumulativeZoomFactor <= 0.15)
			{
				this.cumulativeZoomFactor = (this.view.scale - 0.01) / this.view.scale;
			}
			else
			{
				// Uses to 5% zoom steps for better grid rendering in webkit
				// and to avoid rounding errors for zoom steps
				this.cumulativeZoomFactor /= this.zoomFactor;
				this.cumulativeZoomFactor = Math.round(this.view.scale * this.cumulativeZoomFactor * 20) / 20 / this.view.scale;
			}
		}
		
		this.cumulativeZoomFactor = Math.max(0.01, Math.min(this.view.scale * this.cumulativeZoomFactor, 160) / this.view.scale);
		
		this.updateZoomTimeout = window.setTimeout(mxUtils.bind(this, function()
		{
			this.zoom(this.cumulativeZoomFactor);					
			this.cumulativeZoomFactor = 1;
			this.updateZoomTimeout = null;
			
			if (resize != null)
			{
				resize(false);
			}
		}), 20);
	};
	
	mxEvent.addMouseWheelListener(mxUtils.bind(this, function(evt, up)
	{
		// Ctrl+wheel (or pinch on touchpad) is a native browser zoom event is OS X
		// LATER: Add support for zoom via pinch on trackpad for Chrome in OS X
		if ((mxEvent.isAltDown(evt) || (mxEvent.isControlDown(evt) && !mxClient.IS_MAC) ||
			graph.panningHandler.isActive()) && (this.dialogs == null || this.dialogs.length == 0))
		{
			var source = mxEvent.getSource(evt);
			
			while (source != null)
			{
				if (source == graph.container)
				{
					graph.lazyZoom(up);
					mxEvent.consume(evt);
					
					return;
				}
				
				source = source.parentNode;
			}
		}
	}));
};

/**
 * 
 */
EditorUi.prototype.getEditBlankXml = function()
{
	return mxUtils.getXml(this.editor.getGraphXml());
};

/**
 * Adds support for placeholders in labels.
 */
EditorUi.prototype.lightboxFit = function()
{
	// LATER: Use initial graph bounds to avoid rounding errors
	this.editor.graph.maxFitScale = 2;
	this.editor.graph.fit(20);
	this.editor.graph.maxFitScale = null;
};

/**
 * 
 */
EditorUi.prototype.editAsNew = function(xml, title)
{
	var p = (title != null) ? '&title=' + encodeURIComponent(title) : '';
	
	if (window.postMessage)
	{
		var wnd = null;
		
		var receive = mxUtils.bind(this, function(evt)
		{
			if (evt.data == 'ready' && evt.source == wnd)
			{
				wnd.postMessage(xml, '*');
				window.removeEventListener('message', receive);
			}
		});
		
		window.addEventListener('message', receive);
		wnd = window.open(this.editBlankUrl + p);
	}
	else
	{
		// Data is pulled from global variable after tab loads
		window.drawdata = xml;
		window.open(this.editBlankFallbackUrl + p);
	}
};

/**
 * Hook for allowing selection and context menu for certain events.
 */
EditorUi.prototype.isSelectionAllowed = function(evt)
{
	return mxEvent.getSource(evt).nodeName == 'SELECT' || (mxEvent.getSource(evt).nodeName == 'INPUT' &&
		mxUtils.isAncestorNode(this.formatContainer, mxEvent.getSource(evt)));
};

/**
 * Installs dialog if browser window is closed without saving
 * This must be disabled during save and image export.
 */
EditorUi.prototype.addBeforeUnloadListener = function()
{
	// Installs dialog if browser window is closed without saving
	// This must be disabled during save and image export
	window.onbeforeunload = mxUtils.bind(this, function()
	{
		return this.onBeforeUnload();
	});
};

/**
 * Sets the onbeforeunload for the application
 */
EditorUi.prototype.onBeforeUnload = function()
{
	if (this.editor.modified)
	{
		return mxResources.get('allChangesLost');
	}
};

/**
 * Opens the current diagram via the window.opener if one exists.
 */
EditorUi.prototype.open = function()
{
	// Cross-domain window access is not allowed in FF, so if we
	// were opened from another domain then this will fail.
	try
	{
		if (window.opener != null && window.opener.openFile != null)
		{
			window.opener.openFile.setConsumer(mxUtils.bind(this, function(xml, filename)
			{
				try
				{
					var doc = mxUtils.parseXml(xml); 
					this.editor.setGraphXml(doc.documentElement);
					this.editor.setModified(false);
					this.editor.undoManager.clear();
					
					if (filename != null)
					{
						this.editor.setFilename(filename);
						this.updateDocumentTitle();
					}
					
					return;
				}
				catch (e)
				{
					mxUtils.alert(mxResources.get('invalidOrMissingFile') + ': ' + e.message);
				}
			}));
		}
	}
	catch(e)
	{
		// ignore
	}
	
	// Fires as the last step if no file was loaded
	this.editor.graph.view.validate();
	
	// Required only in special cases where an initial file is opened
	// and the minimumGraphSize changes and CSS must be updated.
	this.editor.graph.sizeDidChange();
	this.editor.fireEvent(new mxEventObject('resetGraphView'));
};

/**
 * Sets the current menu and element.
 */
EditorUi.prototype.setCurrentMenu = function(menu, elt)
{
	this.currentMenuElt = elt;
	this.currentMenu = menu;
};

/**
 * Resets the current menu and element.
 */
EditorUi.prototype.resetCurrentMenu = function()
{
	this.currentMenuElt = null;
	this.currentMenu = null;
};

/**
 * Hides and destroys the current menu.
 */
EditorUi.prototype.hideCurrentMenu = function(menu, elt)
{
	if (this.currentMenu != null)
	{
		this.currentMenu.hideMenu();
		this.resetCurrentMenu();
	}
};

/**
 * Updates the document title.
 */
EditorUi.prototype.updateDocumentTitle = function()
{
	var title = this.editor.getOrCreateFilename();
	
	if (this.editor.appName != null)
	{
		title += ' - ' + this.editor.appName;
	}
	
	document.title = title;
};

/**
 * Updates the document title.
 */
EditorUi.prototype.createHoverIcons = function()
{
	return new HoverIcons(this.editor.graph);
};

/**
 * Returns the URL for a copy of this editor with no state.
 */
EditorUi.prototype.redo = function()
{
	try
	{
		var graph = this.editor.graph;
		
		if (graph.isEditing())
		{
			document.execCommand('redo', false, null);
		}
		else
		{
			this.editor.undoManager.redo();
		}
	}
	catch (e)
	{
		// ignore all errors
	}
};

/**
 * Returns the URL for a copy of this editor with no state.
 */
EditorUi.prototype.undo = function()
{
	try
	{
		var graph = this.editor.graph;
	
		if (graph.isEditing())
		{
			// Stops editing and executes undo on graph if native undo
			// does not affect current editing value
			var value = graph.cellEditor.textarea.innerHTML;
			document.execCommand('undo', false, null);
	
			if (value == graph.cellEditor.textarea.innerHTML)
			{
				graph.stopEditing(true);
				this.editor.undoManager.undo();
			}
		}
		else
		{
			this.editor.undoManager.undo();
		}
	}
	catch (e)
	{
		// ignore all errors
	}
};

/**
 * Returns the URL for a copy of this editor with no state.
 */
EditorUi.prototype.canRedo = function()
{
	return this.editor.graph.isEditing() || this.editor.undoManager.canRedo();
};

/**
 * Returns the URL for a copy of this editor with no state.
 */
EditorUi.prototype.canUndo = function()
{
	return this.editor.graph.isEditing() || this.editor.undoManager.canUndo();
};

/**
 * Returns the URL for a copy of this editor with no state.
 */
EditorUi.prototype.getUrl = function(pathname)
{
	var href = (pathname != null) ? pathname : window.location.pathname;
	var parms = (href.indexOf('?') > 0) ? 1 : 0;
	
	// Removes template URL parameter for new blank diagram
	for (var key in urlParams)
	{
		if (parms == 0)
		{
			href += '?';
		}
		else
		{
			href += '&';
		}
	
		href += key + '=' + urlParams[key];
		parms++;
	}
	
	return href;
};

/**
 * Specifies if the graph has scrollbars.
 */
EditorUi.prototype.setScrollbars = function(value)
{
	var graph = this.editor.graph;
	var prev = graph.container.style.overflow;
	graph.scrollbars = value;
	this.editor.updateGraphComponents();

	if (prev != graph.container.style.overflow)
	{
		if (graph.container.style.overflow == 'hidden')
		{
			var t = graph.view.translate;
			graph.view.setTranslate(t.x - graph.container.scrollLeft / graph.view.scale, t.y - graph.container.scrollTop / graph.view.scale);
			graph.container.scrollLeft = 0;
			graph.container.scrollTop = 0;
			graph.minimumGraphSize = null;
			graph.sizeDidChange();
		}
		else
		{
			var dx = graph.view.translate.x;
			var dy = graph.view.translate.y;

			graph.view.translate.x = 0;
			graph.view.translate.y = 0;
			graph.sizeDidChange();
			graph.container.scrollLeft -= Math.round(dx * graph.view.scale);
			graph.container.scrollTop -= Math.round(dy * graph.view.scale);
		}
	}
	
	this.fireEvent(new mxEventObject('scrollbarsChanged'));
};

/**
 * Returns true if the graph has scrollbars.
 */
EditorUi.prototype.hasScrollbars = function()
{
	return this.editor.graph.scrollbars;
};

/**
 * Resets the state of the scrollbars.
 */
EditorUi.prototype.resetScrollbars = function()
{
	var graph = this.editor.graph;
	
	if (!this.editor.extendCanvas)
	{
		graph.container.scrollTop = 0;
		graph.container.scrollLeft = 0;
	
		if (!mxUtils.hasScrollbars(graph.container))
		{
			graph.view.setTranslate(0, 0);
		}
	}
	else if (!this.editor.chromeless)
	{
		if (mxUtils.hasScrollbars(graph.container))
		{
			if (graph.pageVisible)
			{
				var pad = graph.getPagePadding();
				graph.container.scrollTop = Math.floor(pad.y - this.editor.initialTopSpacing);
				graph.container.scrollLeft = Math.floor(Math.min(pad.x, (graph.container.scrollWidth - graph.container.clientWidth) / 2));
			}
			else
			{
				var bounds = graph.getGraphBounds();
				var width = Math.max(bounds.width, graph.scrollTileSize.width * graph.view.scale);
				var height = Math.max(bounds.height, graph.scrollTileSize.height * graph.view.scale);
				graph.container.scrollTop = Math.floor(Math.max(0, bounds.y - Math.max(20, (graph.container.clientHeight - height) / 4)));
				graph.container.scrollLeft = Math.floor(Math.max(0, bounds.x - Math.max(0, (graph.container.clientWidth - width) / 2)));
			}
		}
		else
		{
			// This code is not actively used since the default for scrollbars is always true
			if (graph.pageVisible)
			{
				var b = graph.view.getBackgroundPageBounds();
				graph.view.setTranslate(Math.floor(Math.max(0, (graph.container.clientWidth - b.width) / 2) - b.x),
					Math.floor(Math.max(0, (graph.container.clientHeight - b.height) / 2) - b.y));
			}
			else
			{
				var bounds = graph.getGraphBounds();
				graph.view.setTranslate(Math.floor(Math.max(0, Math.max(0, (graph.container.clientWidth - bounds.width) / 2) - bounds.x)),
					Math.floor(Math.max(0, Math.max(20, (graph.container.clientHeight - bounds.height) / 4)) - bounds.y));
			}
		}
	}
};

/**
 * Loads the stylesheet for this graph.
 */
EditorUi.prototype.setBackgroundColor = function(value)
{
	this.editor.graph.background = value;
	this.editor.graph.view.validateBackground();

	this.fireEvent(new mxEventObject('backgroundColorChanged'));
};

/**
 * Loads the stylesheet for this graph.
 */
EditorUi.prototype.setFoldingEnabled = function(value)
{
	this.editor.graph.foldingEnabled = value;
	this.editor.graph.view.revalidate();
	
	this.fireEvent(new mxEventObject('foldingEnabledChanged'));
};

/**
 * Loads the stylesheet for this graph.
 */
EditorUi.prototype.setPageFormat = function(value)
{
	this.editor.graph.pageFormat = value;
	
	if (!this.editor.graph.pageVisible)
	{
		this.actions.get('pageView').funct();
	}
	else
	{
		this.editor.graph.view.validateBackground();
		this.editor.graph.sizeDidChange();
	}

	this.fireEvent(new mxEventObject('pageFormatChanged'));
};


/**
 * Updates the states of the given undo/redo items.
 */
EditorUi.prototype.addUndoListener = function()
{
	var undo = this.actions.get('undo');
	var redo = this.actions.get('redo');
	
	var undoMgr = this.editor.undoManager;
	
    var undoListener = mxUtils.bind(this, function()
    {
    	undo.setEnabled(this.canUndo());
    	redo.setEnabled(this.canRedo());
    });

    undoMgr.addListener(mxEvent.ADD, undoListener);
    undoMgr.addListener(mxEvent.UNDO, undoListener);
    undoMgr.addListener(mxEvent.REDO, undoListener);
    undoMgr.addListener(mxEvent.CLEAR, undoListener);
	
	// Overrides cell editor to update action states
	var cellEditorStartEditing = this.editor.graph.cellEditor.startEditing;
	
	this.editor.graph.cellEditor.startEditing = function()
	{
		cellEditorStartEditing.apply(this, arguments);
		undoListener();
	};
	
	var cellEditorStopEditing = this.editor.graph.cellEditor.stopEditing;
	
	this.editor.graph.cellEditor.stopEditing = function(cell, trigger)
	{
		cellEditorStopEditing.apply(this, arguments);
		undoListener();
	};
	
	// Updates the button states once
    undoListener();
};

/**
* Updates the states of the given toolbar items based on the selection.
*/
EditorUi.prototype.updateActionStates = function()
{
	var graph = this.editor.graph;
	var selected = !graph.isSelectionEmpty();
	var vertexSelected = false;
	var edgeSelected = false;

	var cells = graph.getSelectionCells();
	
	if (cells != null)
	{
    	for (var i = 0; i < cells.length; i++)
    	{
    		var cell = cells[i];
    		
    		if (graph.getModel().isEdge(cell))
    		{
    			edgeSelected = true;
    		}
    		
    		if (graph.getModel().isVertex(cell))
    		{
    			vertexSelected = true;
    		}
    		
    		if (edgeSelected && vertexSelected)
			{
				break;
			}
    	}
	}
	
	// Updates action states
	var actions = ['cut', 'copy', 'bold', 'italic', 'underline', 'delete', 'duplicate',
	               'editStyle', 'editTooltip', 'editLink', 'backgroundColor', 'borderColor',
	               'toFront', 'toBack', 'lockUnlock', 'solid', 'dashed',
	               'dotted', 'fillColor', 'gradientColor', 'shadow', 'fontColor',
	               'formattedText', 'rounded', 'toggleRounded', 'sharp', 'strokeColor'];
	
	for (var i = 0; i < actions.length; i++)
	{
		this.actions.get(actions[i]).setEnabled(selected);
	}
	
	this.actions.get('setAsDefaultStyle').setEnabled(graph.getSelectionCount() == 1);
	this.actions.get('turn').setEnabled(!graph.isSelectionEmpty());
	this.actions.get('curved').setEnabled(edgeSelected);
	this.actions.get('clearWaypoints').setEnabled(edgeSelected);
	this.actions.get('rotation').setEnabled(vertexSelected);
	this.actions.get('wordWrap').setEnabled(vertexSelected);
	this.actions.get('autosize').setEnabled(vertexSelected);
	this.actions.get('collapsible').setEnabled(vertexSelected);
   	var oneVertexSelected = vertexSelected && graph.getSelectionCount() == 1;
	this.actions.get('group').setEnabled(graph.getSelectionCount() > 1 ||
		(oneVertexSelected && !graph.isContainer(graph.getSelectionCell())));
	this.actions.get('ungroup').setEnabled(graph.getSelectionCount() == 1 &&
		(graph.getModel().getChildCount(graph.getSelectionCell()) > 0 ||
		(oneVertexSelected && graph.isContainer(graph.getSelectionCell()))));
   	this.actions.get('removeFromGroup').setEnabled(oneVertexSelected &&
   		graph.getModel().isVertex(graph.getModel().getParent(graph.getSelectionCell())));

	// Updates menu states
   	var state = graph.view.getState(graph.getSelectionCell());
    this.menus.get('navigation').setEnabled(selected || graph.view.currentRoot != null);
    this.actions.get('collapsible').setEnabled(vertexSelected && graph.getSelectionCount() == 1 &&
    	(graph.isContainer(graph.getSelectionCell()) || graph.model.getChildCount(graph.getSelectionCell()) > 0));
    this.actions.get('home').setEnabled(graph.view.currentRoot != null);
    this.actions.get('exitGroup').setEnabled(graph.view.currentRoot != null);
    this.actions.get('enterGroup').setEnabled(graph.getSelectionCount() == 1 && graph.isValidRoot(graph.getSelectionCell()));
    var foldable = graph.getSelectionCount() == 1 && graph.isCellFoldable(graph.getSelectionCell())
    this.actions.get('expand').setEnabled(foldable);
    this.actions.get('collapse').setEnabled(foldable);
    this.actions.get('editLink').setEnabled(graph.getSelectionCount() == 1);
    this.actions.get('openLink').setEnabled(graph.getSelectionCount() == 1 &&
    	graph.getLinkForCell(graph.getSelectionCell()) != null);
    this.actions.get('guides').setEnabled(graph.isEnabled());
    this.actions.get('grid').setEnabled(!this.editor.chromeless);

    var unlocked = graph.isEnabled() && !graph.isCellLocked(graph.getDefaultParent());
    this.menus.get('layout').setEnabled(unlocked);
    this.menus.get('insert').setEnabled(unlocked);
    this.menus.get('direction').setEnabled(unlocked && vertexSelected);
    this.menus.get('align').setEnabled(unlocked && vertexSelected && graph.getSelectionCount() > 1);
    this.menus.get('distribute').setEnabled(unlocked && vertexSelected && graph.getSelectionCount() > 1);
    this.actions.get('selectVertices').setEnabled(unlocked);
    this.actions.get('selectEdges').setEnabled(unlocked);
    this.actions.get('selectAll').setEnabled(unlocked);
    this.actions.get('selectNone').setEnabled(unlocked);
    
    this.updatePasteActionStates();
};

/**
 * Refreshes the viewport.
 */
EditorUi.prototype.refresh = function(sizeDidChange)
{
	sizeDidChange = (sizeDidChange != null) ? sizeDidChange : true;
	
	var quirks = mxClient.IS_IE && (document.documentMode == null || document.documentMode == 5);
	var w = this.container.clientWidth;
	var h = this.container.clientHeight;

	if (this.container == document.body)
	{
		w = document.body.clientWidth || document.documentElement.clientWidth;
		h = (quirks) ? document.body.clientHeight || document.documentElement.clientHeight : document.documentElement.clientHeight;
	}
	
	// Workaround for bug on iOS see
	// http://stackoverflow.com/questions/19012135/ios-7-ipad-safari-landscape-innerheight-outerheight-layout-issue
	// FIXME: Fix if footer visible
	var off = 0;
	
	if (mxClient.IS_IOS && !window.navigator.standalone)
	{
		if (window.innerHeight != document.documentElement.clientHeight)
		{
			off = document.documentElement.clientHeight - window.innerHeight;
			window.scrollTo(0, 0);
		}
	}
	
	var effHsplitPosition = Math.max(0, Math.min(this.hsplitPosition, w - this.splitSize - 20));

	var tmp = 0;
	
	if (this.menubar != null)
	{
		this.menubarContainer.style.height = this.menubarHeight + 'px';
		tmp += this.menubarHeight;
	}
	
	if (this.toolbar != null)
	{
		this.toolbarContainer.style.top = this.menubarHeight + 'px';
		this.toolbarContainer.style.height = this.toolbarHeight + 'px';
		tmp += this.toolbarHeight;
	}
	
	if (tmp > 0 && !mxClient.IS_QUIRKS)
	{
		tmp += 1;
	}
	
	var sidebarFooterHeight = 0;
	
	if (this.sidebarFooterContainer != null)
	{
		var bottom = this.footerHeight + off;
		sidebarFooterHeight = Math.max(0, Math.min(h - tmp - bottom, this.sidebarFooterHeight));
		this.sidebarFooterContainer.style.width = effHsplitPosition + 'px';
		this.sidebarFooterContainer.style.height = sidebarFooterHeight + 'px';
		this.sidebarFooterContainer.style.bottom = bottom + 'px';
	}
	
	var fw = (this.format != null) ? this.formatWidth : 0;
	this.sidebarContainer.style.top = tmp + 'px';
	this.sidebarContainer.style.width = effHsplitPosition + 'px';
	this.formatContainer.style.top = tmp + 'px';
	this.formatContainer.style.width = fw + 'px';
	this.formatContainer.style.display = (this.format != null) ? '' : 'none';
	
	this.diagramContainer.style.left = (this.hsplit.parentNode != null) ? (effHsplitPosition + this.splitSize) + 'px' : '0px';
	this.diagramContainer.style.top = this.sidebarContainer.style.top;
	this.footerContainer.style.height = this.footerHeight + 'px';
	this.hsplit.style.top = this.sidebarContainer.style.top;
	this.hsplit.style.bottom = (this.footerHeight + off) + 'px';
	this.hsplit.style.left = effHsplitPosition + 'px';
	
	if (this.tabContainer != null)
	{
		this.tabContainer.style.left = this.diagramContainer.style.left;
	}
	
	if (quirks)
	{
		this.menubarContainer.style.width = w + 'px';
		this.toolbarContainer.style.width = this.menubarContainer.style.width;
		var sidebarHeight = Math.max(0, h - this.footerHeight - this.menubarHeight - this.toolbarHeight);
		this.sidebarContainer.style.height = (sidebarHeight - sidebarFooterHeight) + 'px';
		this.formatContainer.style.height = sidebarHeight + 'px';
		this.diagramContainer.style.width = (this.hsplit.parentNode != null) ? Math.max(0, w - effHsplitPosition - this.splitSize - fw) + 'px' : w + 'px';
		this.footerContainer.style.width = this.menubarContainer.style.width;
		var diagramHeight = Math.max(0, h - this.footerHeight - this.menubarHeight - this.toolbarHeight);
		
		if (this.tabContainer != null)
		{
			this.tabContainer.style.width = this.diagramContainer.style.width;
			this.tabContainer.style.bottom = (this.footerHeight + off) + 'px';
			diagramHeight -= this.tabContainer.clientHeight;
		}
		
		this.diagramContainer.style.height = diagramHeight + 'px';
		this.hsplit.style.height = diagramHeight + 'px';
	}
	else
	{
		if (this.footerHeight > 0)
		{
			this.footerContainer.style.bottom = off + 'px';
		}
		
		this.diagramContainer.style.right = fw + 'px';
		var th = 0;
		
		if (this.tabContainer != null)
		{
			this.tabContainer.style.bottom = (this.footerHeight + off) + 'px';
			this.tabContainer.style.right = this.diagramContainer.style.right;
			th = this.tabContainer.clientHeight;
		}
		
		this.sidebarContainer.style.bottom = (this.footerHeight + sidebarFooterHeight + off) + 'px';
		this.formatContainer.style.bottom = (this.footerHeight + off) + 'px';
		this.diagramContainer.style.bottom = (this.footerHeight + off + th) + 'px';
	}
	
	if (sizeDidChange)
	{
		this.editor.graph.sizeDidChange();
	}
};

/**
 * Creates the required containers.
 */
EditorUi.prototype.createTabContainer = function()
{
	return null;
};

/**
 * Creates the required containers.
 */
EditorUi.prototype.createDivs = function()
{
	this.menubarContainer = this.createDiv('geMenubarContainer');
	this.toolbarContainer = this.createDiv('geToolbarContainer');
	this.sidebarContainer = this.createDiv('geSidebarContainer');
	this.formatContainer = this.createDiv('geSidebarContainer');
	this.diagramContainer = this.createDiv('geDiagramContainer');
	this.footerContainer = this.createDiv('geFooterContainer');
	this.hsplit = this.createDiv('geHsplit');
	this.hsplit.setAttribute('title', mxResources.get('collapseExpand'));

	// Sets static style for containers
	this.menubarContainer.style.top = '0px';
	this.menubarContainer.style.left = '0px';
	this.menubarContainer.style.right = '0px';
	this.toolbarContainer.style.left = '0px';
	this.toolbarContainer.style.right = '0px';
	this.sidebarContainer.style.left = '0px';
	this.formatContainer.style.right = '0px';
	this.formatContainer.style.zIndex = '1';
	this.diagramContainer.style.right = ((this.format != null) ? this.formatWidth : 0) + 'px';
	this.footerContainer.style.left = '0px';
	this.footerContainer.style.right = '0px';
	this.footerContainer.style.bottom = '0px';
	this.footerContainer.style.zIndex = mxPopupMenu.prototype.zIndex - 2;
	this.hsplit.style.width = this.splitSize + 'px';
	
	// Only vertical scrollbars, no background in format sidebar
	this.formatContainer.style.backgroundColor = 'whiteSmoke';
	this.formatContainer.style.overflowX = 'hidden';
	this.formatContainer.style.overflowY = 'auto';
	this.formatContainer.style.fontSize = '12px';
	
	this.sidebarFooterContainer = this.createSidebarFooterContainer();
	
	if (this.sidebarFooterContainer)
	{
		this.sidebarFooterContainer.style.left = '0px';
	}
	
	this.tabContainer = this.createTabContainer();
};

/**
 * Hook for sidebar footer container. This implementation returns null.
 */
EditorUi.prototype.createSidebarFooterContainer = function()
{
	return null;
};

/**
 * Creates the required containers.
 */
EditorUi.prototype.createUi = function()
{
	// Creates menubar
	this.menubar = (this.editor.chromeless) ? null : this.menus.createMenubar(this.createDiv('geMenubar'));
	
	if (this.menubar != null)
	{
		this.menubarContainer.appendChild(this.menubar.container);
	}
	
	// Adds status bar in menubar
	if (this.menubar != null)
	{
		this.statusContainer = this.createStatusContainer();
	
		// Connects the status bar to the editor status
		this.editor.addListener('statusChanged', mxUtils.bind(this, function()
		{
			this.setStatusText(this.editor.getStatus());
		}));
	
		this.setStatusText(this.editor.getStatus());
		this.menubar.container.appendChild(this.statusContainer);
		
		// Inserts into DOM
		this.container.appendChild(this.menubarContainer);
	}

	// Creates the sidebar
	this.sidebar = (this.editor.chromeless) ? null : this.createSidebar(this.sidebarContainer);
	
	if (this.sidebar != null)
	{
		this.container.appendChild(this.sidebarContainer);
	}
	
	// Creates the format sidebar
	this.format = (this.editor.chromeless || !this.formatEnabled) ? null : this.createFormat(this.formatContainer);
	
	if (this.format != null)
	{
		this.container.appendChild(this.formatContainer);
	}
	
	// Creates the footer
	var footer = (this.editor.chromeless) ? null : this.createFooter();
	
	if (footer != null)
	{
		this.footerContainer.appendChild(footer);
		this.container.appendChild(this.footerContainer);
	}

	if (this.sidebar != null && this.sidebarFooterContainer)
	{
		this.container.appendChild(this.sidebarFooterContainer);		
	}

	this.container.appendChild(this.diagramContainer);

	if (this.container != null && this.tabContainer != null)
	{
		this.container.appendChild(this.tabContainer);
	}

	// Creates toolbar
	this.toolbar = (this.editor.chromeless) ? null : this.createToolbar(this.createDiv('geToolbar'));
	
	if (this.toolbar != null)
	{
		this.toolbarContainer.appendChild(this.toolbar.container);
		this.container.appendChild(this.toolbarContainer);
	}

	// HSplit
	if (this.sidebar != null)
	{
		this.container.appendChild(this.hsplit);
		
		this.addSplitHandler(this.hsplit, true, 0, mxUtils.bind(this, function(value)
		{
			this.hsplitPosition = value;
			this.refresh();
		}));
	}
};

/**
 * Creates a new toolbar for the given container.
 */
EditorUi.prototype.createStatusContainer = function()
{
	var container = document.createElement('a');
	container.className = 'geItem geStatus';
	
	return container;
};

/**
 * Creates a new toolbar for the given container.
 */
EditorUi.prototype.setStatusText = function(value)
{
	this.statusContainer.innerHTML = value;
};

/**
 * Creates a new toolbar for the given container.
 */
EditorUi.prototype.createToolbar = function(container)
{
	return new Toolbar(this, container);
};

/**
 * Creates a new sidebar for the given container.
 */
EditorUi.prototype.createSidebar = function(container)
{
	return new Sidebar(this, container);
};

/**
 * Creates a new sidebar for the given container.
 */
EditorUi.prototype.createFormat = function(container)
{
	return new Format(this, container);
};

/**
 * Creates and returns a new footer.
 */
EditorUi.prototype.createFooter = function()
{
	return this.createDiv('geFooter');
};

/**
 * Creates the actual toolbar for the toolbar container.
 */
EditorUi.prototype.createDiv = function(classname)
{
	var elt = document.createElement('div');
	elt.className = classname;
	
	return elt;
};

/**
 * Updates the states of the given undo/redo items.
 */
EditorUi.prototype.addSplitHandler = function(elt, horizontal, dx, onChange)
{
	var start = null;
	var initial = null;
	var ignoreClick = true;
	var last = null;

	// Disables built-in pan and zoom in IE10 and later
	if (mxClient.IS_POINTER)
	{
		elt.style.touchAction = 'none';
	}
	
	var getValue = mxUtils.bind(this, function()
	{
		var result = parseInt(((horizontal) ? elt.style.left : elt.style.bottom));
	
		// Takes into account hidden footer
		if (!horizontal)
		{
			result = result + dx - this.footerHeight;
		}
		
		return result;
	});

	function moveHandler(evt)
	{
		if (start != null)
		{
			var pt = new mxPoint(mxEvent.getClientX(evt), mxEvent.getClientY(evt));
			onChange(Math.max(0, initial + ((horizontal) ? (pt.x - start.x) : (start.y - pt.y)) - dx));
			mxEvent.consume(evt);
			
			if (initial != getValue())
			{
				ignoreClick = true;
				last = null;
			}
		}
	};
	
	function dropHandler(evt)
	{
		moveHandler(evt);
		initial = null;
		start = null;
	};
	
	mxEvent.addGestureListeners(elt, function(evt)
	{
		start = new mxPoint(mxEvent.getClientX(evt), mxEvent.getClientY(evt));
		initial = getValue();
		ignoreClick = false;
		mxEvent.consume(evt);
	});
	
	mxEvent.addListener(elt, 'click', function(evt)
	{
		if (!ignoreClick)
		{
			var next = (last != null) ? last - dx : 0;
			last = getValue();
			onChange(next);
			mxEvent.consume(evt);
		}
	});

	mxEvent.addGestureListeners(document, null, moveHandler, dropHandler);
	
	this.destroyFunctions.push(function()
	{
		mxEvent.removeGestureListeners(document, null, moveHandler, dropHandler);
	});	
};

/**
 * Displays a print dialog.
 */
EditorUi.prototype.showDialog = function(elt, w, h, modal, closable, onClose)
{
	this.editor.graph.tooltipHandler.hideTooltip();
	
	if (this.dialogs == null)
	{
		this.dialogs = [];
	}
	
	this.dialog = new Dialog(this, elt, w, h, modal, closable, onClose);
	this.dialogs.push(this.dialog);
};

/**
 * Displays a print dialog.
 */
EditorUi.prototype.hideDialog = function(cancel)
{
	if (this.dialogs != null && this.dialogs.length > 0)
	{
		var dlg = this.dialogs.pop();
		dlg.close(cancel);
		
		this.dialog = (this.dialogs.length > 0) ? this.dialogs[this.dialogs.length - 1] : null;

		if (this.dialog == null && this.editor.graph.container.style.visibility != 'hidden')
		{
			this.editor.graph.container.focus();
		}
		
		this.editor.fireEvent(new mxEventObject('hideDialog'));
	}
};

/**
 * Display a color dialog.
 */
EditorUi.prototype.pickColor = function(color, apply)
{
	var graph = this.editor.graph;
	var selState = graph.cellEditor.saveSelection();
	
	var dlg = new ColorDialog(this, color || 'none', function(color)
	{
		graph.cellEditor.restoreSelection(selState);
		apply(color);
	}, function()
	{
		graph.cellEditor.restoreSelection(selState);
	});
	this.showDialog(dlg.container, 220, 430, true, false);
	dlg.init();
};

/**
 * Adds the label menu items to the given menu and parent.
 */
EditorUi.prototype.openFile = function()
{
	// Closes dialog after open
	window.openFile = new OpenFile(mxUtils.bind(this, function(cancel)
	{
		this.hideDialog(cancel);
	}));

	// Removes openFile if dialog is closed
	this.showDialog(new OpenDialog(this).container, (Editor.useLocalStorage) ? 640 : 320,
			(Editor.useLocalStorage) ? 480 : 220, true, true, function()
	{
		window.openFile = null;
	});
};

/**
 * Extracs the graph model from the given HTML data from a data transfer event.
 */
EditorUi.prototype.extractGraphModelFromHtml = function(data)
{
	var result = null;
	
	try
	{
    	var idx = data.indexOf('&lt;mxGraphModel ');
    	
    	if (idx >= 0)
    	{
    		var idx2 = data.lastIndexOf('&lt;/mxGraphModel&gt;');
    		
    		if (idx2 > idx)
    		{
    			result = data.substring(idx, idx2 + 21).replace(/&gt;/g, '>').
    				replace(/&lt;/g, '<').replace(/\n/g, '');
    		}
    	}
	}
	catch (e)
	{
		// ignore
	}
	
	return result;
};

/**
 * Returns true if the given string contains a compatible graph model.
 */
EditorUi.prototype.isCompatibleString = function(data)
{
	try
	{
		var doc = mxUtils.parseXml(data);
		var node = this.editor.extractGraphModel(doc.documentElement);
		
		return node != null && node.getElementsByTagName('parsererror').length == 0;
	}
	catch (e)
	{
		// ignore
	}
	
	return false;
};

/**
 * Opens the given files in the editor.
 */
EditorUi.prototype.extractGraphModelFromEvent = function(evt)
{
	var result = null;
	var data = null;
	
	if (evt != null)
	{
		var provider = (evt.dataTransfer != null) ? evt.dataTransfer : evt.clipboardData;
		
		if (provider != null)
		{
			if (document.documentMode == 10 || document.documentMode == 11)
			{
				data = provider.getData('Text');
			}
			else
			{
				data = (mxUtils.indexOf(provider.types, 'text/html') >= 0) ? provider.getData('text/html') : null;
			
				if (mxUtils.indexOf(provider.types, 'text/plain' && (data == null || data.length == 0)))
				{
					data = provider.getData('text/plain');
				}
			}

			if (data != null)
			{
				data = this.editor.graph.zapGremlins(mxUtils.trim(data));
				
				// Tries parsing as HTML document with embedded XML
				var xml =  this.extractGraphModelFromHtml(data);
				
				if (xml != null)
				{
					data = xml;
				}
			}		
		}
	}
	
	if (data != null && this.isCompatibleString(data))
	{
		result = data;
	}
	
	return result;
};

/**
 * Adds the label menu items to the given menu and parent.
 */
EditorUi.prototype.saveFile = function(forceDialog)
{
	if (!forceDialog && this.editor.filename != null)
	{
		this.save(this.editor.getOrCreateFilename());
	}
	else
	{
		var dlg = new FilenameDialog(this, this.editor.getOrCreateFilename(), mxResources.get('save'), mxUtils.bind(this, function(name)
		{
			this.save(name);
		}), null, mxUtils.bind(this, function(name)
		{
			if (name != null && name.length > 0)
			{
				return true;
			}
			
			mxUtils.confirm(mxResources.get('invalidName'));
			
			return false;
		}));
		this.showDialog(dlg.container, 300, 100, true, true);
		dlg.init();
	}
};

/**
 * Saves the current graph under the given filename.
 */
EditorUi.prototype.save = function(name)
{
	if (name != null)
	{
		if (this.editor.graph.isEditing())
		{
			this.editor.graph.stopEditing();
		}
		
		var xml = mxUtils.getXml(this.editor.getGraphXml());
		
		try
		{
			if (Editor.useLocalStorage)
			{
				if (localStorage.getItem(name) != null &&
					!mxUtils.confirm(mxResources.get('replaceIt', [name])))
				{
					return;
				}

				localStorage.setItem(name, xml);
				this.editor.setStatus(mxResources.get('saved') + ' ' + new Date());
			}
			else
			{
				if (xml.length < MAX_REQUEST_SIZE)
				{
					new mxXmlRequest(SAVE_URL, 'filename=' + encodeURIComponent(name) +
						'&xml=' + encodeURIComponent(xml)).simulate(document, '_blank');
				}
				else
				{
					mxUtils.alert(mxResources.get('drawingTooLarge'));
					mxUtils.popup(xml);
					
					return;
				}
			}

			this.editor.setModified(false);
			this.editor.setFilename(name);
			this.updateDocumentTitle();
		}
		catch (e)
		{
			this.editor.setStatus('Error saving file');
		}
	}
};

/**
 * Executes the given layout.
 */
EditorUi.prototype.executeLayout = function(exec, animate, post)
{
	var graph = this.editor.graph;

	if (graph.isEnabled())
	{
		graph.getModel().beginUpdate();
		try
		{
			exec();
		}
		catch (e)
		{
			throw e;
		}
		finally
		{
			// Animates the changes in the graph model except
			// for Camino, where animation is too slow
			if (this.allowAnimation && animate && navigator.userAgent.indexOf('Camino') < 0)
			{
				// New API for animating graph layout results asynchronously
				var morph = new mxMorphing(graph);
				morph.addListener(mxEvent.DONE, mxUtils.bind(this, function()
				{
					graph.getModel().endUpdate();
					
					if (post != null)
					{
						post();
					}
				}));
				
				morph.startAnimation();
			}
			else
			{
				graph.getModel().endUpdate();
			}
		}
	}
};

/**
 * Hides the current menu.
 */
EditorUi.prototype.showImageDialog = function(title, value, fn, ignoreExisting)
{
	var cellEditor = this.editor.graph.cellEditor;
	var selState = cellEditor.saveSelection();
	var newValue = mxUtils.prompt(title, value);
	cellEditor.restoreSelection(selState);
	
	if (newValue != null && newValue.length > 0)
	{
		var img = new Image();
		
		img.onload = function()
		{
			fn(newValue, img.width, img.height);
		};
		img.onerror = function()
		{
			fn(null);
			mxUtils.alert(mxResources.get('fileNotFound'));
		};
		
		img.src = newValue;
	}
	else
	{
		fn(null);
	}
};

/**
 * Hides the current menu.
 */
EditorUi.prototype.showLinkDialog = function(value, btnLabel, fn)
{
	var dlg = new LinkDialog(this, value, btnLabel, fn);
	this.showDialog(dlg.container, 420, 90, true, true);
	dlg.init();
};

/**
 * Hides the current menu.
 */
EditorUi.prototype.showBackgroundImageDialog = function(apply)
{
	apply = (apply != null) ? apply : mxUtils.bind(this, function(image)
	{
		this.setBackgroundImage(image);
	});
	var newValue = mxUtils.prompt(mxResources.get('backgroundImage'), '');
	
	if (newValue != null && newValue.length > 0)
	{
		var img = new Image();
		
		img.onload = function()
		{
			apply(new mxImage(newValue, img.width, img.height));
		};
		img.onerror = function()
		{
			apply(null);
			mxUtils.alert(mxResources.get('fileNotFound'));
		};
		
		img.src = newValue;
	}
	else
	{
		apply(null);
	}
};

/**
 * Loads the stylesheet for this graph.
 */
EditorUi.prototype.setBackgroundImage = function(image)
{
	this.editor.graph.setBackgroundImage(image);
	this.editor.graph.view.validateBackgroundImage();

	this.fireEvent(new mxEventObject('backgroundImageChanged'));
};

/**
 * Creates the keyboard event handler for the current graph and history.
 */
EditorUi.prototype.confirm = function(msg, okFn, cancelFn)
{
	if (mxUtils.confirm(msg))
	{
		if (okFn != null)
		{
			okFn();
		}
	}
	else if (cancelFn != null)
	{
		cancelFn();
	}
};

/**
 * Creates the keyboard event handler for the current graph and history.
 */
EditorUi.prototype.createOutline = function(wnd)
{
	var outline = new mxOutline(this.editor.graph);
	outline.border = 20;

	mxEvent.addListener(window, 'resize', function()
	{
		outline.update();
	});
	
	this.addListener('pageFormatChanged', function()
	{
		outline.update();
	});

	return outline;
};

/**
 * Creates the keyboard event handler for the current graph and history.
 */
EditorUi.prototype.createKeyHandler = function(editor)
{
	var graph = this.editor.graph;
	var keyHandler = new mxKeyHandler(graph);

	var isEventIgnored = keyHandler.isEventIgnored;
	keyHandler.isEventIgnored = function(evt)
	{
		// Handles undo/redo via action and allows ctrl+b/u/i only if editing value is HTML (except for FF and Safari)
		return (!this.isControlDown(evt) || mxEvent.isShiftDown(evt) || (evt.keyCode != 90 && evt.keyCode != 89)) &&
			((evt.keyCode != 66 && evt.keyCode != 73 && evt.keyCode != 85) || !this.isControlDown(evt) ||
			(this.graph.cellEditor.isContentEditing() && !mxClient.IS_FF && !mxClient.IS_SF)) &&
			isEventIgnored.apply(this, arguments);
	};
	
	// Ignores graph enabled state but not chromeless state
	keyHandler.isEnabledForEvent = function(evt)
	{
		return (!mxEvent.isConsumed(evt) && this.isGraphEvent(evt) && this.isEnabled());
	};
	
	// Routes command-key to control-key on Mac
	keyHandler.isControlDown = function(evt)
	{
		return mxEvent.isControlDown(evt) || (mxClient.IS_MAC && evt.metaKey);
	};
	
	var queue = [];
	var thread = null;
	
	// Helper function to move cells with the cursor keys
	function nudge(keyCode, stepSize, resize)
	{
		queue.push(function()
		{
			if (!graph.isSelectionEmpty() && graph.isEnabled())
			{
				stepSize = (stepSize != null) ? stepSize : 1;
	
				if (resize)
				{
					// Resizes all selected vertices
					graph.getModel().beginUpdate();
					try
					{
						var cells = graph.getSelectionCells();
						
						for (var i = 0; i < cells.length; i++)
						{
							if (graph.getModel().isVertex(cells[i]) && graph.isCellResizable(cells[i]))
							{
								var geo = graph.getCellGeometry(cells[i]);
								
								if (geo != null)
								{
									geo = geo.clone();
									
									if (keyCode == 37)
									{
										geo.width = Math.max(0, geo.width - stepSize);
									}
									else if (keyCode == 38)
									{
										geo.height = Math.max(0, geo.height - stepSize);
									}
									else if (keyCode == 39)
									{
										geo.width += stepSize;
									}
									else if (keyCode == 40)
									{
										geo.height += stepSize;
									}
									
									graph.getModel().setGeometry(cells[i], geo);
								}
							}
						}
					}
					finally
					{
						graph.getModel().endUpdate();
					}
				}
				else
				{
					// Moves vertices up/down in a stack layout
					var cell = graph.getSelectionCell();
					var parent = graph.model.getParent(cell);
					var layout = null;
	
					if (graph.getSelectionCount() == 1 && graph.model.isVertex(cell) &&
						graph.layoutManager != null && !graph.isCellLocked(cell))
					{
						layout = graph.layoutManager.getLayout(parent);
					}
					
					if (layout != null && layout.constructor == mxStackLayout)
					{
						var index = parent.getIndex(cell);
						
						if (keyCode == 37 || keyCode == 38)
						{
							graph.model.add(parent, cell, Math.max(0, index - 1));
						}
						else if (keyCode == 39 ||keyCode == 40)
						{
							graph.model.add(parent, cell, Math.min(graph.model.getChildCount(parent), index + 1));
						}
					}
					else
					{
						var dx = 0;
						var dy = 0;
						
						if (keyCode == 37)
						{
							dx = -stepSize;
						}
						else if (keyCode == 38)
						{
							dy = -stepSize;
						}
						else if (keyCode == 39)
						{
							dx = stepSize;
						}
						else if (keyCode == 40)
						{
							dy = stepSize;
						}
						
						graph.moveCells(graph.getMovableCells(graph.getSelectionCells()), dx, dy);
					}				
				}
			}
		});
		
		if (thread != null)
		{
			window.clearTimeout(thread);
		}
		
		thread = window.setTimeout(function()
		{
			if (queue.length > 0)
			{
				graph.getModel().beginUpdate();
				try
				{
					for (var i = 0; i < queue.length; i++)
					{
						queue[i]();
					}
					
					queue = [];
				}
				finally
				{
					graph.getModel().endUpdate();
				}
				graph.scrollCellToVisible(graph.getSelectionCell());
			}
		}, 200);
	};
	
	// Binds keystrokes to actions
	keyHandler.bindAction = mxUtils.bind(this, function(code, control, key, shift)
	{
		var action = this.actions.get(key);
		
		if (action != null)
		{
			var f = function()
			{
				if (action.isEnabled())
				{
					action.funct();
				}
			};
    		
			if (control)
			{
				if (shift)
				{
					keyHandler.bindControlShiftKey(code, f);
				}
				else
				{
					keyHandler.bindControlKey(code, f);
				}
			}
			else
			{
				if (shift)
				{
					keyHandler.bindShiftKey(code, f);
				}
				else
				{
					keyHandler.bindKey(code, f);
				}
			}
		}
	});

	var ui = this;
	var keyHandlerEscape = keyHandler.escape;
	keyHandler.escape = function(evt)
	{
		keyHandlerEscape.apply(this, arguments);
	};

	// Ignores enter keystroke. Remove this line if you want the
	// enter keystroke to stop editing. N, W, T are reserved.
	keyHandler.enter = function() {};
	
	keyHandler.bindControlShiftKey(36, function() { graph.exitGroup(); }); // Ctrl+Shift+Home
	keyHandler.bindControlShiftKey(35, function() { graph.enterGroup(); }); // Ctrl+Shift+End
	keyHandler.bindKey(36, function() { graph.home(); }); // Home
	keyHandler.bindKey(35, function() { graph.refresh(); }); // End
	keyHandler.bindAction(107, true, 'zoomIn'); // Ctrl+Plus
	keyHandler.bindAction(109, true, 'zoomOut'); // Ctrl+Minus
	keyHandler.bindAction(80, true, 'print'); // Ctrl+P
	keyHandler.bindAction(79, true, 'outline', true); // Ctrl+Shift+O
	keyHandler.bindAction(112, false, 'about'); // F1

	if (!this.editor.chromeless)
	{
		keyHandler.bindControlKey(36, function() { if (graph.isEnabled()) { graph.foldCells(true); }}); // Ctrl+Home
		keyHandler.bindControlKey(35, function() { if (graph.isEnabled()) { graph.foldCells(false); }}); // Ctrl+End
		keyHandler.bindKey(37, function() { nudge(37); }); // Left arrow
		keyHandler.bindKey(38, function() { nudge(38); }); // Up arrow
		keyHandler.bindKey(39, function() { nudge(39); }); // Right arrow
		keyHandler.bindKey(40, function() { nudge(40); }); // Down arrow
		keyHandler.bindShiftKey(37, function() { nudge(37, graph.gridSize); }); // Shift+Left arrow
		keyHandler.bindShiftKey(38, function() { nudge(38, graph.gridSize); }); // Shift+Up arrow
		keyHandler.bindShiftKey(39, function() { nudge(39, graph.gridSize); }); // Shift+Right arrow
		keyHandler.bindShiftKey(40, function() { nudge(40, graph.gridSize); }); // Shift+Down arrow
		keyHandler.bindControlKey(37, function() { nudge(37, null, true); }); // Ctrl+Left arrow
		keyHandler.bindControlKey(38, function() { nudge(38, null, true); }); // Ctrl+Up arrow
		keyHandler.bindControlKey(39, function() { nudge(39, null, true); }); // Ctrl+Right arrow
		keyHandler.bindControlKey(40, function() { nudge(40, null, true); }); // Ctrl+Down arrow
		keyHandler.bindControlShiftKey(37, function() { nudge(37, graph.gridSize, true); }); // Ctrl+Left arrow
		keyHandler.bindControlShiftKey(38, function() { nudge(38, graph.gridSize, true); }); // Ctrl+Shift+Up arrow
		keyHandler.bindControlShiftKey(39, function() { nudge(39, graph.gridSize, true); }); // Ctrl+Shift+Right arrow
		keyHandler.bindControlShiftKey(40, function() { nudge(40, graph.gridSize, true); }); // Ctrl+Shift+Down arrow
		keyHandler.bindControlKey(13, function() { if (graph.isEnabled()) { graph.setSelectionCells(graph.duplicateCells(graph.getSelectionCells(), false)); }}); // Ctrl+Enter
		keyHandler.bindShiftKey(9, function() { if (graph.isEnabled()) { graph.selectPreviousCell(); }}); // Shift+Tab
		keyHandler.bindControlKey(9, function() { if (graph.isEnabled()) { graph.selectParentCell(); }}); // Ctrl+Tab
		keyHandler.bindControlShiftKey(9, function() { if (graph.isEnabled()) { graph.selectChildCell(); }}); // Ctrl+Shift+Tab
		keyHandler.bindAction(8, false, 'delete'); // Backspace
		keyHandler.bindAction(8, true, 'deleteAll'); // Backspace
		keyHandler.bindAction(46, false, 'delete'); // Delete
		keyHandler.bindAction(46, true, 'deleteAll'); // Ctrl+Delete
		keyHandler.bindAction(72, true, 'resetView'); // Ctrl+H
		keyHandler.bindAction(72, true, 'fitWindow', true); // Ctrl+Shift+H
		keyHandler.bindAction(74, true, 'fitPage'); // Ctrl+J
		keyHandler.bindAction(74, true, 'fitTwoPages', true); // Ctrl+Shift+J
		keyHandler.bindAction(48, true, 'customZoom'); // Ctrl+0
		keyHandler.bindAction(82, true, 'turn'); // Ctrl+R
		keyHandler.bindAction(82, true, 'clearDefaultStyle', true); // Ctrl+Shift+R
		keyHandler.bindAction(83, true, 'save'); // Ctrl+S
		keyHandler.bindAction(83, true, 'saveAs', true); // Ctrl+Shift+S
		keyHandler.bindAction(65, true, 'selectAll'); // Ctrl+A
		keyHandler.bindAction(65, true, 'selectNone', true); // Ctrl+A
		keyHandler.bindAction(73, true, 'selectVertices', true); // Ctrl+Shift+I
		keyHandler.bindAction(69, true, 'selectEdges', true); // Ctrl+Shift+E
		keyHandler.bindAction(69, true, 'editStyle'); // Ctrl+E
		keyHandler.bindAction(66, true, 'bold'); // Ctrl+B
		keyHandler.bindAction(66, true, 'toBack', true); // Ctrl+Shift+B
		keyHandler.bindAction(70, true, 'toFront', true); // Ctrl+Shift+F
		keyHandler.bindAction(68, true, 'duplicate'); // Ctrl+D
		keyHandler.bindAction(68, true, 'setAsDefaultStyle', true); // Ctrl+Shift+D   
		keyHandler.bindAction(90, true, 'undo'); // Ctrl+Z
		keyHandler.bindAction(89, true, 'autosize', true); // Ctrl+Shift+Y
		keyHandler.bindAction(88, true, 'cut'); // Ctrl+X
		keyHandler.bindAction(67, true, 'copy'); // Ctrl+C
		keyHandler.bindAction(81, true, 'connectionArrows'); // Ctrl+Q
		keyHandler.bindAction(81, true, 'connectionPoints', true); // Ctrl+Shift+Q
		keyHandler.bindAction(86, true, 'paste'); // Ctrl+V
		keyHandler.bindAction(71, true, 'group'); // Ctrl+G
		keyHandler.bindAction(77, true, 'editData'); // Ctrl+M
		keyHandler.bindAction(71, true, 'grid', true); // Ctrl+Shift+G
		keyHandler.bindAction(73, true, 'italic'); // Ctrl+I
		keyHandler.bindAction(76, true, 'lockUnlock'); // Ctrl+L
		keyHandler.bindAction(76, true, 'layers', true); // Ctrl+Shift+L
		keyHandler.bindAction(80, true, 'formatPanel', true); // Ctrl+Shift+P
		keyHandler.bindAction(85, true, 'underline'); // Ctrl+U
		keyHandler.bindAction(85, true, 'ungroup', true); // Ctrl+Shift+U
		keyHandler.bindKey(13, function() { if (graph.isEnabled()) { graph.startEditingAtCell(); }}); // Enter
		keyHandler.bindKey(113, function() { if (graph.isEnabled()) { graph.startEditingAtCell(); }}); // F2
	}
	
	if (mxClient.IS_MAC)
	{
		keyHandler.bindAction(90, true, 'redo', true); // Ctrl+Shift+Z
	}
	else
	{
		keyHandler.bindAction(89, true, 'redo'); // Ctrl+Y
	}
	
	return keyHandler;
};

/**
 * Creates the keyboard event handler for the current graph and history.
 */
EditorUi.prototype.destroy = function()
{
	if (this.editor != null)
	{
		this.editor.destroy();
		this.editor = null;
	}
	
	if (this.menubar != null)
	{
		this.menubar.destroy();
		this.menubar = null;
	}
	
	if (this.toolbar != null)
	{
		this.toolbar.destroy();
		this.toolbar = null;
	}
	
	if (this.sidebar != null)
	{
		this.sidebar.destroy();
		this.sidebar = null;
	}
	
	if (this.keyHandler != null)
	{
		this.keyHandler.destroy();
		this.keyHandler = null;
	}
	
	if (this.keydownHandler != null)
	{
		mxEvent.removeListener(document, 'keydown', this.keydownHandler);
		this.keydownHandler = null;
	}
		
	if (this.keyupHandler != null)
	{
		mxEvent.removeListener(document, 'keyup', this.keyupHandler);
		this.keyupHandler = null;
	}
	
	if (this.resizeHandler != null)
	{
		mxEvent.removeListener(window, 'resize', this.resizeHandler);
		this.resizeHandler = null;
	}
	
	if (this.gestureHandler != null)
	{
		mxEvent.removeGestureListeners(document, this.gestureHandler);
		this.gestureHandler = null;
	}
	
	if (this.orientationChangeHandler != null)
	{
		mxEvent.removeListener(window, 'orientationchange', this.orientationChangeHandler);
		this.orientationChangeHandler = null;
	}
	
	if (this.scrollHandler != null)
	{
		mxEvent.removeListener(window, 'scroll', this.scrollHandler);
		this.scrollHandler = null;
	}

	if (this.destroyFunctions != null)
	{
		for (var i = 0; i < this.destroyFunctions.length; i++)
		{
			this.destroyFunctions[i]();
		}
		
		this.destroyFunctions = null;
	}
	
	var c = [this.menubarContainer, this.toolbarContainer, this.sidebarContainer,
	         this.formatContainer, this.diagramContainer, this.footerContainer,
	         this.chromelessToolbar, this.hsplit, this.sidebarFooterContainer];
	
	for (var i = 0; i < c.length; i++)
	{
		if (c[i] != null && c[i].parentNode != null)
		{
			c[i].parentNode.removeChild(c[i]);
		}
	}
};
