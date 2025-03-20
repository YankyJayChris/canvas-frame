// Default styles applied to new shapes
const AdvancedStyles = {
    display: "block",
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    float: "none",
    clear: "none",
    zIndex: 0,
    width: "50px",
    height: "50px",
    maxWidth: "none",
    maxHeight: "none",
    minWidth: "10px",
    minHeight: "10px",
    boxSizing: "border-box",
    margin: 0,
    padding: 0,
    border: "1px solid #000",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#000",
    borderRadius: 0,
    backgroundColor: "#aabbcc",
    backgroundImage: "none",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#000000",
    fontFamily: "Arial",
    fontSize: "16px",
    fontWeight: "normal",
    fontStyle: "normal",
    lineHeight: "normal",
    letterSpacing: "normal",
    textAlign: "left",
    opacity: 1,
    boxShadow: "2px 2px 4px rgba(0,0,0,0.2)",
    transform: "none",
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    gridTemplateColumns: "auto",
    gridTemplateRows: "auto",
    gap: "0px",
    overflow: "hidden",
    stroke: "#000",
    strokeWidth: "2px",
};

// State management class with enhanced history tracking and scope control
class StateManager {
    constructor(key) {
        this.key = key; // LocalStorage key for persistence
        this.history = []; // Array of state snapshots
        this.currentIndex = -1; // Current position in history
        this.batchSize = 100; // Limit history size
        this.scope = []; // Temporary scope for grouping actions
    }

    // Start a scope to group multiple actions into one undo/redo step
    beginScope() {
        this.scope = [];
    }

    // End a scope and commit it as a single history entry
    endScope(actionDescription) {
        if (this.scope.length) {
            this.addState(this.scope[this.scope.length - 1], actionDescription);
            this.scope = [];
        }
    }

    // Add a state to history (or scope if active)
    addState(state, actionDescription = "Unknown Action") {
        if (this.scope.length) {
            this.scope.push(this.cloneState(state));
            return;
        }
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1); // Trim future states
        }
        this.history.push({ state: this.cloneState(state), action: actionDescription });
        this.currentIndex++;
        if (this.history.length > this.batchSize) {
            this.history.shift(); // Remove oldest entry
            this.currentIndex--;
        }
        localStorage.setItem(this.key, JSON.stringify(this.history));
    }

    // Undo to previous state
    undo() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            return this.cloneState(this.history[this.currentIndex].state);
        }
        return null;
    }

    // Redo to next state
    redo() {
        if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            return this.cloneState(this.history[this.currentIndex].state);
        }
        return null;
    }

    // Load saved state from localStorage
    load() {
        const saved = localStorage.getItem(this.key);
        if (saved) {
            this.history = JSON.parse(saved);
            this.currentIndex = this.history.length - 1;
            return this.cloneState(this.history[this.currentIndex].state);
        }
        return null;
    }

    // Clear saved state
    clear() {
        localStorage.removeItem(this.key);
    }

    // Get history for UI display
    getHistory() {
        return this.history.map((entry, index) => ({
            index,
            action: entry.action,
            isCurrent: index === this.currentIndex
        }));
    }

    // Deep clone a state to avoid reference issues
    cloneState(state) {
        return state.map(shape => {
            const newShape = { ...shape };
            if (newShape.children) newShape.children = this.cloneState(newShape.children);
            if (newShape.styles) newShape.styles = { ...newShape.styles };
            if (newShape.frames) newShape.frames = [...newShape.frames];
            if (newShape.events) newShape.events = { ...newShape.events };
            if (newShape.componentRef) newShape.componentRef = shape.componentRef; // Reference, not cloned
            return newShape;
        });
    }
}

// Main canvas manipulation class
class CanvasManipulator {
	constructor(canvasIdOrElement, settings = {}) {
		// Initialize canvas and context
		this.canvas =
			typeof canvasIdOrElement === "string"
				? document.getElementById(canvasIdOrElement) || this.createCanvas()
				: canvasIdOrElement;
		this.ctx = this.canvas.getContext("2d");

		// State and interaction flags
		this.state = new StateManager("canvasState");
		this.isDrawing = false;
		this.isDragging = false;
		this.isResizing = false;
		this.isRotating = false;
		this.isPanning = false;
		this.currentShape = null;
		this.selectedShapes = [];
		this.shapes = [];
		this.startX = 0;
		this.startY = 0;
		this.resizeHandle = null;

		// Settings and UI controls
		this.showOverlay =
			settings.showOverlay !== undefined ? settings.showOverlay : false;
		this.disableZoom =
			settings.disableZoom !== undefined ? settings.disableZoom : false;
		this.gridSize = settings.gridSize || 10;
		this.snapToGrid =
			settings.snapToGrid !== undefined ? settings.snapToGrid : true;
		this.scale = 1; // Zoom level
		this.panX = 0; // Pan offset X
		this.panY = 0; // Pan offset Y
		this.settings = {
			width: settings.width || 800,
			height: settings.height || 600,
			backgroundColor: settings.backgroundColor || "#ffffff",
			...settings,
		};

		// Additional data structures
		this.animationFrames = new Map(); // Animation frame IDs
		this.currentFrameIndex = new Map(); // Current animation frame
		this.pausedAnimations = new Set(); // Paused animations
		this.scrollOffsets = new Map(); // Scroll offsets for scrollable elements
		this.hoverHandle = null; // Handle under mouse
		this.templates = new Map(); // Saved templates
		this.components = new Map(); // Reusable components
		this.layersVisible = new Map(); // Layer visibility
		this.guides = []; // Custom guides
		this.pathPoints = []; // Points for path drawing

		// Set canvas dimensions and focus
		this.canvas.width = this.settings.width;
		this.canvas.height = this.settings.height;
		this.canvas.tabIndex = 0;

		// Load saved state
		const savedState = this.state.load();
		if (savedState) this.shapes = savedState;

		// Initialize event listeners and redraw
		this.initEventListeners();
		this.redraw();
		window.addEventListener("beforeunload", () => this.state.clear());
	}

	// Create a new canvas if none provided
	createCanvas() {
		const canvas = document.createElement("canvas");
		document.body.appendChild(canvas);
		return canvas;
	}

	// Calculate dimensions based on units (px, %, vh, vw)
	calculateDimension(value, parentDimension, viewportDimension) {
		if (value === "auto") return parentDimension;
		if (value.endsWith("%")) return (parseFloat(value) / 100) * parentDimension;
		if (value.endsWith("vh"))
			return (parseFloat(value) / 100) * viewportDimension;
		if (value.endsWith("vw"))
			return (parseFloat(value) / 100) * window.innerWidth;
		return parseFloat(value) || 0;
	}

	// Get canvas element
	getCanvas() {
		return this.canvas;
	}

	// Find shape by ID, including nested ones
	getElementById(id) {
		return (
			this.shapes.find((s) => s.id === id) ||
			this.findNestedShape(id, this.shapes)
		);
	}

	// Export canvas in various formats
	exportCanvas(format = "png", quality = 0.92) {
		if (format === "svg") return this.exportToSVG();
		if (format === "html") return this.exportToHTML();
		if (format === "react") return this.exportToReact();
		return this.canvas.toDataURL(`image/${format}`, quality);
	}

	// Export to SVG
	exportToSVG() {
		let svg = `<svg width="${this.canvas.width}" height="${this.canvas.height}" xmlns="http://www.w3.org/2000/svg">`;
		this.shapes.forEach((shape) => {
			if (this.isLayerVisible(shape.id)) svg += this.shapeToSVG(shape);
		});
		svg += "</svg>";
		return "data:image/svg+xml;base64," + btoa(svg);
	}

	// Convert shape to SVG
	shapeToSVG(shape, parentX = 0, parentY = 0) {
		const x = shape.x + parentX;
		const y = shape.y + parentY;
		const width = this.calculateDimension(
			shape.width,
			this.canvas.width,
			this.canvas.height
		);
		const height = this.calculateDimension(
			shape.height,
			this.canvas.height,
			this.canvas.height
		);
		let svg = "";
		switch (shape.type) {
			case "rectangle":
			case "div":
			case "scroll":
			case "board":
				svg = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${shape.styles.backgroundColor}" stroke="${shape.styles.borderColor}" stroke-width="${shape.styles.borderWidth}"/>`;
				break;
			case "text":
				svg = `<text x="${x}" y="${
					y + parseFloat(shape.styles.fontSize)
				}" font-family="${shape.styles.fontFamily}" font-size="${
					shape.styles.fontSize
				}" fill="${shape.styles.color}">${shape.text}</text>`;
				break;
			case "path":
				svg = `<path d="${shape.pathData}" fill="${shape.styles.backgroundColor}" stroke="${shape.styles.stroke}" stroke-width="${shape.styles.strokeWidth}"/>`;
				break;
			default:
				svg = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${shape.styles.backgroundColor}" stroke="${shape.styles.borderColor}" stroke-width="${shape.styles.borderWidth}"/>`;
		}
		if (shape.children) {
			shape.children.forEach((child) => {
				if (this.isLayerVisible(child.id)) svg += this.shapeToSVG(child, x, y);
			});
		}
		return svg;
	}

	// Export to HTML
	exportToHTML() {
		let html = `<div style="width:${this.canvas.width}px;height:${this.canvas.height}px;background:${this.settings.backgroundColor};position:relative;">`;
		this.shapes.forEach((shape) => {
			if (this.isLayerVisible(shape.id)) html += this.shapeToHTML(shape);
		});
		html += "</div>";
		return html;
	}

	// Convert shape to HTML
	shapeToHTML(shape, parentX = 0, parentY = 0) {
		const x = shape.x + parentX;
		const y = shape.y + parentY;
		const width = shape.width;
		const height = shape.height;
		let styles = `position:absolute;left:${x}px;top:${y}px;width:${width};height:${height};`;
		for (const [key, value] of Object.entries(shape.styles)) {
			styles += `${key.replace(/([A-Z])/g, "-$1").toLowerCase()}:${value};`;
		}
		let html = `<div style="${styles}" data-id="${shape.id}">`;
		if (shape.type === "text") html += shape.text;
		if (shape.type === "button")
			html += `<button>${shape.text || "Button"}</button>`;
		if (shape.children) {
			shape.children.forEach((child) => {
				if (this.isLayerVisible(child.id))
					html += this.shapeToHTML(child, x, y);
			});
		}
		html += "</div>";
		return html;
	}

	// Export to React component
	exportToReact() {
		let code = `import React from 'react';\n\nconst CanvasComponent = () => (\n  <div style={{ width: '${this.canvas.width}px', height: '${this.canvas.height}px', background: '${this.settings.backgroundColor}', position: 'relative' }}>\n`;
		this.shapes.forEach((shape) => {
			if (this.isLayerVisible(shape.id)) code += this.shapeToReact(shape);
		});
		code += `  </div>\n);\n\nexport default CanvasComponent;`;
		return code;
	}

	// Convert shape to React JSX
	shapeToReact(shape, parentX = 0, parentY = 0) {
		const x = shape.x + parentX;
		const y = shape.y + parentY;
		const width = shape.width;
		const height = shape.height;
		let style = `style={{ position: 'absolute', left: '${x}px', top: '${y}px', width: '${width}', height: '${height}'`;
		for (const [key, value] of Object.entries(shape.styles)) {
			style += `, ${key.replace(/([A-Z])/g, "-$1").toLowerCase()}: '${value}'`;
		}
		style += " }}";
		let jsx = `    <div ${style} data-id="${shape.id}"`;
		if (shape.events) {
			for (const [event, action] of Object.entries(shape.events)) {
				jsx += ` on${
					event.charAt(0).toUpperCase() + event.slice(1)
				}={() => ${action}}`;
			}
		}
		jsx += ">";
		if (shape.type === "text") jsx += shape.text;
		if (shape.type === "button")
			jsx += `<button>${shape.text || "Button"}</button>`;
		if (shape.children) {
			shape.children.forEach((child) => {
				if (this.isLayerVisible(child.id))
					jsx += "\n" + this.shapeToReact(child, x, y);
			});
		}
		jsx += `</div>\n`;
		return jsx;
	}

	// Redraw the canvas with all elements
	redraw() {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.fillStyle = this.settings.backgroundColor;
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		// Apply zoom and pan transformations
		this.ctx.save();
		this.ctx.translate(this.panX, this.panY);
		this.ctx.scale(this.scale, this.scale);

		// Draw grid if enabled
		if (this.snapToGrid) {
			this.ctx.strokeStyle = "#ddd";
			this.ctx.lineWidth = 0.5 / this.scale;
			for (let x = 0; x < this.canvas.width; x += this.gridSize) {
				this.ctx.beginPath();
				this.ctx.moveTo(x, 0);
				this.ctx.lineTo(x, this.canvas.height);
				this.ctx.stroke();
			}
			for (let y = 0; y < this.canvas.height; y += this.gridSize) {
				this.ctx.beginPath();
				this.ctx.moveTo(0, y);
				this.ctx.lineTo(this.canvas.width, y);
				this.ctx.stroke();
			}
		}

		// Draw rulers
		this.ctx.strokeStyle = "#000";
		this.ctx.lineWidth = 1 / this.scale;
		this.ctx.beginPath();
		this.ctx.moveTo(0, 20);
		this.ctx.lineTo(this.canvas.width, 20);
		this.ctx.moveTo(20, 0);
		this.ctx.lineTo(20, this.canvas.height);
		this.ctx.stroke();
		for (let i = 0; i < this.canvas.width; i += 50) {
			this.ctx.moveTo(i, 15);
			this.ctx.lineTo(i, 20);
		}
		for (let i = 0; i < this.canvas.height; i += 50) {
			this.ctx.moveTo(15, i);
			this.ctx.lineTo(20, i);
		}
		this.ctx.stroke();

		// Draw guides
		this.guides.forEach((guide) => {
			this.ctx.strokeStyle = "#00f";
			this.ctx.beginPath();
			if (guide.type === "horizontal") {
				this.ctx.moveTo(0, guide.y);
				this.ctx.lineTo(this.canvas.width, guide.y);
			} else {
				this.ctx.moveTo(guide.x, 0);
				this.ctx.lineTo(guide.x, this.canvas.height);
			}
			this.ctx.stroke();
		});

		// Draw shapes
		this.shapes.forEach((shape) => {
			if (this.isLayerVisible(shape.id)) this.drawShape(shape);
		});

		// Draw selection overlay
		if (this.showOverlay && this.selectedShapes.length) {
			this.selectedShapes.forEach((shape) => this.drawSelection(shape));
		}

		this.ctx.restore();
	}

	// Clear the canvas
	clearCanvas() {
		this.shapes = [];
		this.selectedShapes = [];
		this.animationFrames.clear();
		this.currentFrameIndex.clear();
		this.pausedAnimations.clear();
		this.scrollOffsets.clear();
		this.layersVisible.clear();
		this.guides = [];
		this.state.addState([], "Clear Canvas");
		this.redraw();
	}

	// Start drawing a new shape
	startDrawing(type) {
		this.currentShape = type;
	}

	// Delete selected shapes
	deleteSelected() {
		if (this.selectedShapes.length) {
			this.selectedShapes.forEach((shape) => {
				this.shapes = this.shapes.filter((s) => s.id !== shape.id);
			});
			this.selectedShapes = [];
			this.state.addState([...this.shapes], "Delete Selected");
			this.redraw();
		}
	}

	// Update a shape property
	updateShapeProperty(id, property, value) {
		const shape = this.getElementById(id);
		if (shape) {
			if (property === "frames") {
				shape.frames = value;
			} else if (property in shape) {
				shape[property] = value;
			} else {
				shape.styles[property] = value;
			}
			if (shape.componentRef) {
				this.updateComponentClones(shape.componentRef, property, value);
			}
			this.state.addState([...this.shapes], `Update ${property} of ${id}`);
			this.redraw();
		}
	}

	// Add a new shape
	addShape(shape, parentId = null) {
		shape.id = shape.id || `shape_${Date.now()}`;
		shape.styles = { ...AdvancedStyles, ...shape.styles };
		shape.layerIndex = this.shapes.length;
		if (parentId) {
			const parent = this.getElementById(parentId);
			if (parent) {
				if (!parent.children) parent.children = [];
				shape.x -= parent.x;
				shape.y -= parent.y;
				parent.children.push(shape);
			}
		} else {
			this.shapes.push(shape);
		}
		this.layersVisible.set(shape.id, true);
		this.state.addState([...this.shapes], `Add ${shape.type}`);
		this.redraw();
	}

	// Copy selected shapes to clipboard
	copySelected() {
		this.clipboard = this.selectedShapes.map((shape) => ({ ...shape }));
	}

	// Paste clipboard contents
	pasteClipboard() {
		const newElements = this.clipboard.map((shape) => {
			const newShape = { ...shape, id: `shape_${Date.now()}` };
			newShape.x += 20;
			newShape.y += 20;
			return newShape;
		});
		newElements.forEach((shape) => this.addShape(shape));
		this.selectedShapes = newElements;
		this.state.addState([...this.shapes], "Paste Elements");
		this.redraw();
	}

	// Nest an element into a parent
	nestElement(parentId, childId) {
		const parent = this.getElementById(parentId);
		const child = this.getElementById(childId);
		if (
			parent &&
			child &&
			parent !== child &&
			["div", "scroll", "board"].includes(parent.type)
		) {
			this.shapes = this.shapes.filter((s) => s.id !== childId);
			child.x -= parent.x;
			child.y -= parent.y;
			if (!parent.children) parent.children = [];
			parent.children.push(child);
			if (parent.type === "div") parent.styles.display = "flex";
			this.state.addState([...this.shapes], `Nest ${childId} in ${parentId}`);
			this.redraw();
		}
	}

	// Group selected elements
	groupElements(elementIds) {
		const group = this.createShape("group", 0, 0);
		const elements = this.shapes.filter((s) => elementIds.includes(s.id));
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;

		elements.forEach((el) => {
			const width = this.calculateDimension(
				el.width,
				this.canvas.width,
				this.canvas.height
			);
			const height = this.calculateDimension(
				el.height,
				this.canvas.height,
				this.canvas.height
			);
			minX = Math.min(minX, el.x);
			minY = Math.min(minY, el.y);
			maxX = Math.max(maxX, el.x + width);
			maxY = Math.max(maxY, el.y + height);
		});

		group.x = minX;
		group.y = minY;
		group.width = `${maxX - minX}px`;
		group.height = `${maxY - minY}px`;
		group.styles.width = group.width;
		group.styles.height = group.height;

		elements.forEach((el) => {
			el.x -= minX;
			el.y -= minY;
			group.children.push(el);
			this.shapes = this.shapes.filter((s) => s.id !== el.id);
		});

		this.addShape(group);
		this.state.addState([...this.shapes], "Group Elements");
		this.redraw();
	}

	// Animate an element
	animateElement(id) {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || !shape.frames.length) return;

		this.stopAnimation(id);
		this.currentFrameIndex.set(id, 0);
		this.playAnimation(id);
	}

	// Play animation for an element
	playAnimation(id) {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || !shape.frames.length) return;

		this.stopAnimation(id);
		this.pausedAnimations.delete(id);
		let frameIndex = this.currentFrameIndex.get(id) || 0;

		const animate = () => {
			if (this.pausedAnimations.has(id) || frameIndex >= shape.frames.length) {
				this.animationFrames.delete(id);
				return;
			}

			const frame = shape.frames[frameIndex];
			shape.x = frame.x;
			shape.y = frame.y;
			shape.styles.transform = `rotate(${frame.rotation}deg)`;
			this.currentFrameIndex.set(id, frameIndex);
			this.redraw();

			frameIndex++;
			setTimeout(() => {
				const frameId = requestAnimationFrame(animate);
				this.animationFrames.set(id, frameId);
			}, frame.duration);
		};

		const frameId = requestAnimationFrame(animate);
		this.animationFrames.set(id, frameId);
	}

	// Pause animation
	pauseAnimation(id) {
		if (this.animationFrames.has(id)) this.pausedAnimations.add(id);
	}

	// Stop animation
	stopAnimation(id) {
		const frameId = this.animationFrames.get(id);
		if (frameId) {
			cancelAnimationFrame(frameId);
			this.animationFrames.delete(id);
			this.pausedAnimations.delete(id);
		}
	}

	// Undo last action
	undo() {
		this.shapes = this.state.undo() || [];
		this.selectedShapes = [];
		this.redraw();
	}

	// Redo last undone action
	redo() {
		this.shapes = this.state.redo() || [];
		this.selectedShapes = [];
		this.redraw();
	}

	// Save canvas to JSON file
	saveToJsonFile(filename = "canvas.json") {
		const dataStr = JSON.stringify(this.shapes);
		const blob = new Blob([dataStr], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	// Import from JSON file
	importFromJsonFile(file) {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				this.loadElementsFromJson(JSON.parse(e.target.result));
				resolve();
			};
			reader.readAsText(file);
		});
	}

	// Get elements as JSON
	getElementsAsJson() {
		const cloneShapes = (shapes) =>
			shapes.map((shape) => {
				const clonedShape = { ...shape };
				if (shape.children && shape.children.length > 0) {
					clonedShape.children = cloneShapes(shape.children);
				}
				return clonedShape;
			});
		return cloneShapes(this.shapes);
	}

	// Load elements from JSON
	loadElementsFromJson(jsonData) {
		let shapes = Array.isArray(jsonData) ? jsonData : JSON.parse(jsonData);
		this.shapes = [];
		const cloneShapes = (shapes) =>
			shapes.map((shape) => {
				const clonedShape = {
					...shape,
					styles: { ...AdvancedStyles, ...shape.styles },
					frames: shape.frames ? [...shape.frames] : [],
					children: shape.children ? cloneShapes(shape.children) : [],
					events: shape.events ? { ...shape.events } : {},
				};
				this.layersVisible.set(clonedShape.id, true);
				return clonedShape;
			});

		this.shapes = cloneShapes(shapes);
		this.state.addState([...this.shapes], "Load JSON");
		this.redraw();
	}

	// Center children in parent
	centerChildrenInParent(parentId) {
		const parent = this.getElementById(parentId);
		if (!parent || !parent.children?.length) return;

		const parentWidth = this.calculateDimension(
			parent.width,
			this.canvas.width,
			this.canvas.height
		);
		const parentHeight = this.calculateDimension(
			parent.height,
			this.canvas.height,
			this.canvas.height
		);

		parent.children.forEach((child) => {
			const childWidth = this.calculateDimension(
				child.width,
				parentWidth,
				parentHeight
			);
			const childHeight = this.calculateDimension(
				child.height,
				parentHeight,
				parentHeight
			);
			child.x = (parentWidth - childWidth) / 2;
			child.y = (parentHeight - childHeight) / 2;
		});

		this.state.addState([...this.shapes], `Center Children in ${parentId}`);
		this.redraw();
	}

	// Get accepted shape types
	getAcceptedTypes() {
		return [
			{ type: "rectangle", width: "200px", height: "200px" },
			{ type: "circle", radius: 100, width: "200px", height: "200px" },
			{ type: "line", x2: 0, y2: 0, width: "0px", height: "0px" },
			{
				type: "triangle",
				points: [
					{ x: 0, y: 0 },
					{ x: 200, y: 0 },
					{ x: 100, y: -200 },
				],
				width: "200px",
				height: "200px",
			},
			{
				type: "text",
				text: "Double click to edit",
				width: "200px",
				height: "40px",
			},
			{ type: "input", text: "Input", width: "200px", height: "30px" },
			{ type: "checkbox", checked: false, width: "20px", height: "20px" },
			{
				type: "selector",
				options: ["Option 1", "Option 2", "Option 3"],
				selectedOption: "Option 1",
				width: "150px",
				height: "30px",
			},
			{ type: "div", width: "200px", height: "200px" },
			{
				type: "table",
				tableData: {
					rows: [
						{ cells: ["Cell 1", "Cell 2"] },
						{ cells: ["Cell 3", "Cell 4"] },
					],
				},
				width: "200px",
				height: "100px",
			},
			{ type: "button", text: "Button", width: "100px", height: "40px" },
			{ type: "icon", text: "★", width: "30px", height: "30px" },
			{ type: "image", src: "", width: "200px", height: "200px" },
			{ type: "video", src: "", width: "300px", height: "200px" },
			{
				type: "scroll",
				scrollDirection: "column",
				width: "200px",
				height: "200px",
			},
			{ type: "board", width: "400px", height: "300px" },
			{ type: "path", pathData: "", width: "200px", height: "200px" },
		];
	}

	// Create special shapes with file inputs or specific properties
	createSpecialShape(type, x, y) {
		const id = Date.now().toString();
		const baseProps = {
			id,
			type,
			x,
			y,
			width: "200px",
			height: "40px",
			styles: { ...AdvancedStyles },
			children: [],
			frames: [],
			events: {},
		};

		return new Promise((resolve) => {
			switch (type) {
				case "input":
					resolve({
						...baseProps,
						text: "Input",
						width: "200px",
						height: "30px",
						styles: {
							...baseProps.styles,
							border: "1px solid #000",
							padding: "5px",
						},
					});
					break;
				case "checkbox":
					resolve({
						...baseProps,
						checked: false,
						width: "20px",
						height: "20px",
						styles: { ...baseProps.styles, border: "1px solid #000" },
					});
					break;
				case "selector":
					resolve({
						...baseProps,
						options: ["Option 1", "Option 2", "Option 3"],
						selectedOption: "Option 1",
						width: "150px",
						height: "30px",
						styles: { ...baseProps.styles, border: "1px solid #000" },
					});
					break;
				case "div":
					resolve({
						...baseProps,
						width: "200px",
						height: "200px",
						styles: { ...baseProps.styles, display: "flex" },
					});
					break;
				case "table":
					resolve({
						...baseProps,
						tableData: {
							rows: [
								{ cells: ["Cell 1", "Cell 2"] },
								{ cells: ["Cell 3", "Cell 4"] },
							],
						},
						width: "200px",
						height: "100px",
						styles: { ...baseProps.styles, border: "1px solid #000" },
					});
					break;
				case "button":
					resolve({
						...baseProps,
						text: "Button",
						width: "100px",
						height: "40px",
						styles: {
							...baseProps.styles,
							backgroundColor: "#4CAF50",
							color: "#fff",
							textAlign: "center",
						},
					});
					break;
				case "icon":
					resolve({
						...baseProps,
						text: "★",
						width: "30px",
						height: "30px",
						styles: {
							...baseProps.styles,
							fontSize: "24px",
							textAlign: "center",
						},
					});
					break;
				case "image":
					const imgInput = document.createElement("input");
					imgInput.type = "file";
					imgInput.accept = "image/*";
					imgInput.onchange = (e) => {
						const file = e.target.files[0];
						if (file) {
							const reader = new FileReader();
							reader.onload = (event) =>
								resolve({
									...baseProps,
									src: event.target.result,
									width: "200px",
									height: "200px",
								});
							reader.readAsDataURL(file);
						} else {
							resolve({
								...baseProps,
								src: "",
								width: "200px",
								height: "200px",
							});
						}
					};
					imgInput.click();
					break;
				case "video":
					const vidInput = document.createElement("input");
					vidInput.type = "file";
					vidInput.accept = "video/*";
					vidInput.onchange = (e) => {
						const file = e.target.files[0];
						if (file) {
							const reader = new FileReader();
							reader.onload = (event) =>
								resolve({
									...baseProps,
									src: event.target.result,
									width: "300px",
									height: "200px",
								});
							reader.readAsDataURL(file);
						} else {
							resolve({
								...baseProps,
								src: "",
								width: "300px",
								height: "200px",
							});
						}
					};
					vidInput.click();
					break;
				case "scroll":
					resolve({
						...baseProps,
						scrollDirection: "column",
						scrollOffset: 0,
						width: "200px",
						height: "200px",
						styles: { ...baseProps.styles, overflow: "auto" },
					});
					break;
				case "board":
					resolve({
						...baseProps,
						width: "400px",
						height: "300px",
						styles: { ...baseProps.styles, backgroundColor: "#e0e0e0" },
					});
					break;
				case "path":
					resolve({
						...baseProps,
						pathData: "",
						width: "200px",
						height: "200px",
						styles: { ...baseProps.styles, stroke: "#000", fill: "none" },
					});
					break;
				default:
					resolve(this.createShape(type, x, y));
			}
		});
	}

	// Draw a shape on the canvas
	drawShape(
		shape,
		parentX = 0,
		parentY = 0,
		parentWidth = this.canvas.width,
		parentHeight = this.canvas.height
	) {
		if (shape.styles.display === "none" || !this.isLayerVisible(shape.id))
			return;

		const width = this.calculateDimension(
			shape.width,
			parentWidth,
			parentHeight
		);
		const height = this.calculateDimension(
			shape.height,
			parentWidth,
			parentHeight
		);
		const x = shape.x + parentX;
		const y = shape.y + parentY;

		this.ctx.save();
		this.ctx.globalAlpha = parseFloat(shape.styles.opacity);
		this.ctx.translate(x + width / 2, y + height / 2);
		const rotation = this.getRotationAngle(shape);
		this.ctx.rotate((rotation * Math.PI) / 180);
		this.ctx.translate(-(x + width / 2), -(y + height / 2));

		this.applyStyles(shape.styles, x, y, width, height);

		switch (shape.type) {
			case "rectangle":
			case "div":
			case "board":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				if (shape.children?.length) {
					shape.children.forEach((child) =>
						this.drawShape(child, x, y, width, height)
					);
				}
				break;
			case "circle":
				this.ctx.beginPath();
				this.ctx.arc(
					x + shape.radius,
					y + shape.radius,
					shape.radius,
					0,
					Math.PI * 2
				);
				this.ctx.fill();
				this.ctx.stroke();
				break;
			case "line":
				this.ctx.beginPath();
				this.ctx.moveTo(x, y);
				this.ctx.lineTo(shape.x2, shape.y2);
				this.ctx.strokeStyle = shape.styles.stroke;
				this.ctx.lineWidth = parseFloat(shape.styles.strokeWidth);
				this.ctx.stroke();
				break;
			case "triangle":
				this.ctx.beginPath();
				this.ctx.moveTo(shape.points[0].x + x, shape.points[0].y + y);
				this.ctx.lineTo(shape.points[1].x + x, shape.points[1].y + y);
				this.ctx.lineTo(shape.points[2].x + x, shape.points[2].y + y);
				this.ctx.closePath();
				this.ctx.fill();
				this.ctx.stroke();
				break;
			case "text":
				this.ctx.fillStyle = shape.styles.color;
				this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
				this.ctx.textAlign = shape.styles.textAlign;
				this.ctx.fillText(shape.text, x, y + parseFloat(shape.styles.fontSize));
				this.ctx.strokeRect(x, y, width, height);
				break;
			case "group":
				shape.children.forEach((child) =>
					this.drawShape(child, x, y, width, height)
				);
				this.ctx.strokeRect(x, y, width, height);
				break;
			case "input":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				this.ctx.fillStyle = shape.styles.color;
				this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
				this.ctx.fillText(shape.text || "Input", x + 5, y + height / 2 + 5);
				break;
			case "checkbox":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				if (shape.checked) {
					this.ctx.beginPath();
					this.ctx.moveTo(x + 5, y + height / 2);
					this.ctx.lineTo(x + width / 2, y + height - 5);
					this.ctx.lineTo(x + width - 5, y + 5);
					this.ctx.stroke();
				}
				break;
			case "selector":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				this.ctx.fillStyle = shape.styles.color;
				this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
				this.ctx.fillText(
					shape.selectedOption || shape.options[0],
					x + 5,
					y + height / 2 + 5
				);
				break;
			case "table":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				if (shape.tableData && shape.tableData.rows) {
					const rowHeight = height / shape.tableData.rows.length;
					const colWidth = width / (shape.tableData.rows[0]?.cells.length || 1);
					shape.tableData.rows.forEach((row, rowIndex) => {
						row.cells.forEach((cell, colIndex) => {
							this.ctx.strokeRect(
								x + colIndex * colWidth,
								y + rowIndex * rowHeight,
								colWidth,
								rowHeight
							);
							this.ctx.fillStyle = shape.styles.color;
							this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
							this.ctx.fillText(
								cell,
								x + colIndex * colWidth + 5,
								y + rowIndex * rowHeight + rowHeight / 2 + 5
							);
						});
					});
				}
				break;
			case "button":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				this.ctx.fillStyle = shape.styles.color;
				this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
				this.ctx.textAlign = "center";
				this.ctx.fillText(
					shape.text || "Button",
					x + width / 2,
					y + height / 2 + 5
				);
				break;
			case "icon":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				this.ctx.fillStyle = shape.styles.color;
				this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
				this.ctx.textAlign = "center";
				this.ctx.fillText(shape.text || "★", x + width / 2, y + height / 2 + 5);
				break;
			case "image":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				if (shape.src) {
					const img = new Image();
					img.src = shape.src;
					img.onload = () => this.ctx.drawImage(img, x, y, width, height);
					this.ctx.drawImage(img, x, y, width, height);
				}
				break;
			case "video":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				if (shape.src) {
					this.ctx.fillStyle = shape.styles.color;
					this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
					this.ctx.textAlign = "center";
					this.ctx.fillText(
						"Video Placeholder",
						x + width / 2,
						y + height / 2 + 5
					);
				}
				break;
			case "scroll":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				if (shape.children?.length) {
					const direction = shape.scrollDirection || "column";
					const scrollOffset = this.scrollOffsets.get(shape.id) || 0;
					let offsetX = 0,
						offsetY = 0;
					const contentWidth = shape.children.reduce(
						(sum, child) =>
							direction === "row"
								? sum + this.calculateDimension(child.width, width, height)
								: this.calculateDimension(child.width, width, height),
						0
					);
					const contentHeight = shape.children.reduce(
						(sum, child) =>
							direction === "column"
								? sum + this.calculateDimension(child.height, width, height)
								: this.calculateDimension(child.height, width, height),
						0
					);

					this.ctx.save();
					this.ctx.beginPath();
					this.ctx.rect(x, y, width, height);
					this.ctx.clip();

					shape.children.forEach((child) => {
						child.x = direction === "row" ? offsetX - scrollOffset : 0;
						child.y = direction === "column" ? offsetY - scrollOffset : 0;
						this.drawShape(child, x, y, width, height);
						offsetX +=
							direction === "row"
								? this.calculateDimension(child.width, width, height)
								: 0;
						offsetY +=
							direction === "column"
								? this.calculateDimension(child.height, width, height)
								: 0;
					});

					this.ctx.restore();

					if (
						(direction === "row" && contentWidth > width) ||
						(direction === "column" && contentHeight > height)
					) {
						this.ctx.fillStyle = "rgba(0,0,0,0.3)";
						if (direction === "column") {
							const scrollBarHeight = (height / contentHeight) * height;
							const scrollBarY = y + (scrollOffset / contentHeight) * height;
							this.ctx.fillRect(
								x + width - 10,
								scrollBarY,
								10,
								scrollBarHeight
							);
						} else {
							const scrollBarWidth = (width / contentWidth) * width;
							const scrollBarX = x + (scrollOffset / contentWidth) * width;
							this.ctx.fillRect(
								scrollBarX,
								y + height - 10,
								scrollBarWidth,
								10
							);
						}
					}
				}
				break;
			case "path":
				this.ctx.beginPath();
				if (shape.pathData) {
					this.ctx.strokeStyle = shape.styles.stroke;
					this.ctx.lineWidth = parseFloat(shape.styles.strokeWidth);
					this.ctx.fillStyle = shape.styles.backgroundColor;
					const commands = shape.pathData.split(/(?=[MLQCTAZ])/);
					let currentX = x,
						currentY = y;
					commands.forEach((cmd) => {
						const type = cmd[0];
						const coords = cmd
							.slice(1)
							.trim()
							.split(/[\s,]+/)
							.map(Number);
						switch (type) {
							case "M":
								this.ctx.moveTo(currentX + coords[0], currentY + coords[1]);
								currentX = currentX + coords[0];
								currentY = currentY + coords[1];
								break;
							case "L":
								this.ctx.lineTo(currentX + coords[0], currentY + coords[1]);
								currentX = currentX + coords[0];
								currentY = currentY + coords[1];
								break;
							case "Z":
								this.ctx.closePath();
								break;
							// Add more path commands (Q, C, etc.) as needed
						}
					});
					this.ctx.fill();
					this.ctx.stroke();
				}
				break;
		}
		this.ctx.restore();
	}

	// Apply styles including gradients and patterns
	applyStyles(styles, x, y, width, height) {
		if (styles.backgroundColor.startsWith("linear-gradient")) {
			const gradient = this.ctx.createLinearGradient(x, y, x + width, y);
			const stops = styles.backgroundColor.match(/#\w{6}/g);
			if (stops) {
				stops.forEach((color, i) =>
					gradient.addColorStop(i / (stops.length - 1), color)
				);
			}
			this.ctx.fillStyle = gradient;
		} else if (styles.backgroundColor.startsWith("pattern")) {
			const img = new Image();
			img.src = styles.backgroundImage;
			img.onload = () => {
				const pattern = this.ctx.createPattern(img, styles.backgroundRepeat);
				this.ctx.fillStyle = pattern;
			};
		} else {
			this.ctx.fillStyle = styles.backgroundColor;
		}
		this.ctx.strokeStyle =
			styles.borderColor || styles.border.split(" ")[2] || "#000";
		this.ctx.lineWidth =
			parseFloat(styles.borderWidth || styles.border.split(" ")[0]) || 1;
		this.ctx.shadowBlur = parseFloat(styles.boxShadow.split(" ")[2]) || 0;
		this.ctx.shadowColor =
			styles.boxShadow.split(" ").slice(3).join(" ") || "rgba(0,0,0,0.2)";
		this.ctx.shadowOffsetX = parseFloat(styles.boxShadow.split(" ")[0]) || 0;
		this.ctx.shadowOffsetY = parseFloat(styles.boxShadow.split(" ")[1]) || 0;
	}

	// Draw selection overlay with handles
	drawSelection(shape) {
		const width = this.calculateDimension(
			shape.width,
			this.canvas.width,
			this.canvas.height
		);
		const height = this.calculateDimension(
			shape.height,
			this.canvas.height,
			this.canvas.height
		);

		this.ctx.save();
		this.ctx.translate(shape.x + width / 2, shape.y + height / 2);
		this.ctx.rotate((this.getRotationAngle(shape) * Math.PI) / 180);
		this.ctx.translate(-(shape.x + width / 2), -(shape.y + height / 2));

		this.ctx.strokeStyle = "#0000ff";
		this.ctx.lineWidth = 2;
		this.ctx.strokeRect(shape.x - 2, shape.y - 2, width + 4, height + 4);

		const handles = [
			{ pos: "se", x: shape.x + width - 5, y: shape.y + height - 5 },
			{ pos: "sw", x: shape.x - 5, y: shape.y + height - 5 },
			{ pos: "ne", x: shape.x + width - 5, y: shape.y - 5 },
			{ pos: "nw", x: shape.x - 5, y: shape.y - 5 },
			{ pos: "n", x: shape.x + width / 2 - 5, y: shape.y - 5 },
			{ pos: "s", x: shape.x + width / 2 - 5, y: shape.y + height - 5 },
			{ pos: "e", x: shape.x + width - 5, y: shape.y + height / 2 - 5 },
			{ pos: "w", x: shape.x - 5, y: shape.y + height / 2 - 5 },
			{ pos: "rotate", x: shape.x + width / 2 - 5, y: shape.y - 20 },
		];

		handles.forEach((handle) => {
			this.ctx.fillStyle =
				this.hoverHandle === handle.pos ? "#ff0000" : "#ffffff";
			this.ctx.strokeStyle = "#000000";
			this.ctx.fillRect(handle.x, handle.y, 10, 10);
			this.ctx.strokeRect(handle.x, handle.y, 10, 10);
			if (this.hoverHandle === handle.pos) {
				this.canvas.style.cursor = this.getCursorForHandle(handle.pos);
			}
		});

		this.ctx.restore();
	}

	// Get cursor style for resize handles
	getCursorForHandle(handle) {
		switch (handle) {
			case "se":
				return "se-resize";
			case "sw":
				return "sw-resize";
			case "ne":
				return "ne-resize";
			case "nw":
				return "nw-resize";
			case "n":
				return "n-resize";
			case "s":
				return "s-resize";
			case "e":
				return "e-resize";
			case "w":
				return "w-resize";
			case "rotate":
				return "grab";
			default:
				return "default";
		}
	}

	// Toggle selection overlay
	setOverlay(show) {
		this.showOverlay = show;
		this.redraw();
	}

	// Set grid size
	setGridSize(size) {
		this.gridSize = size;
		this.redraw();
	}

	// Toggle snap-to-grid
	toggleSnapToGrid() {
		this.snapToGrid = !this.snapToGrid;
		this.redraw();
	}

	// Layers Management
	toggleLayerVisibility(id) {
		this.layersVisible.set(id, !this.isLayerVisible(id));
		this.redraw();
	}

	isLayerVisible(id) {
		return this.layersVisible.get(id) !== false;
	}

	reorderLayer(id, newIndex) {
		const shape = this.getElementById(id);
		if (shape) {
			const oldIndex = this.shapes.indexOf(shape);
			this.shapes.splice(oldIndex, 1);
			this.shapes.splice(newIndex, 0, shape);
			this.state.addState([...this.shapes], `Reorder Layer ${id}`);
			this.redraw();
		}
	}

	getLayers() {
		return this.shapes.map((shape, index) => ({
			id: shape.id,
			type: shape.type,
			visible: this.isLayerVisible(shape.id),
			index,
		}));
	}

	// Multi-Select Operations
	alignSelected(alignment) {
		if (this.selectedShapes.length < 1) return;
		const parent = this.getCommonParent(this.selectedShapes);
		const baseShape = this.selectedShapes[0];
		const parentWidth = parent
			? this.calculateDimension(
					parent.width,
					this.canvas.width,
					this.canvas.height
			  )
			: this.canvas.width;
		const parentHeight = parent
			? this.calculateDimension(
					parent.height,
					this.canvas.height,
					this.canvas.height
			  )
			: this.canvas.height;
		const baseWidth = this.calculateDimension(
			baseShape.width,
			parentWidth,
			parentHeight
		);
		const baseHeight = this.calculateDimension(
			baseShape.height,
			parentWidth,
			parentHeight
		);

		this.selectedShapes.slice(1).forEach((shape) => {
			const shapeWidth = this.calculateDimension(
				shape.width,
				parentWidth,
				parentHeight
			);
			const shapeHeight = this.calculateDimension(
				shape.height,
				parentWidth,
				parentHeight
			);
			switch (alignment) {
				case "left":
					shape.x = baseShape.x;
					break;
				case "right":
					shape.x = baseShape.x + baseWidth - shapeWidth;
					break;
				case "top":
					shape.y = baseShape.y;
					break;
				case "bottom":
					shape.y = baseShape.y + baseHeight - shapeHeight;
					break;
				case "centerX":
					shape.x = baseShape.x + (baseWidth - shapeWidth) / 2;
					break;
				case "centerY":
					shape.y = baseShape.y + (baseHeight - shapeHeight) / 2;
					break;
			}
			this.restrictWithinParent(shape, parent);
		});
		this.state.addState([...this.shapes], `Align ${alignment}`);
		this.redraw();
	}

	distributeSelected(direction) {
		if (this.selectedShapes.length < 3) return;
		const parent = this.getCommonParent(this.selectedShapes);
		const parentWidth = parent
			? this.calculateDimension(
					parent.width,
					this.canvas.width,
					this.canvas.height
			  )
			: this.canvas.width;
		const parentHeight = parent
			? this.calculateDimension(
					parent.height,
					this.canvas.height,
					this.canvas.height
			  )
			: this.canvas.height;

		this.selectedShapes.sort((a, b) =>
			direction === "horizontal" ? a.x - b.x : a.y - b.y
		);
		const min =
			direction === "horizontal"
				? this.selectedShapes[0].x
				: this.selectedShapes[0].y;
		const max =
			direction === "horizontal"
				? this.selectedShapes[this.selectedShapes.length - 1].x +
				  this.calculateDimension(
						this.selectedShapes[this.selectedShapes.length - 1].width,
						parentWidth,
						parentHeight
				  )
				: this.selectedShapes[this.selectedShapes.length - 1].y +
				  this.calculateDimension(
						this.selectedShapes[this.selectedShapes.length - 1].height,
						parentWidth,
						parentHeight
				  );
		const step = (max - min) / (this.selectedShapes.length - 1);

		this.selectedShapes.forEach((shape, index) => {
			if (direction === "horizontal") {
				shape.x = min + index * step;
			} else {
				shape.y = min + index * step;
			}
			this.restrictWithinParent(shape, parent);
		});
		this.state.addState([...this.shapes], `Distribute ${direction}`);
		this.redraw();
	}

	// Templates
	saveTemplate(name) {
		this.templates.set(name, this.getElementsAsJson());
	}

	loadTemplate(name) {
		const template = this.templates.get(name);
		if (template) {
			this.loadElementsFromJson(template);
		}
	}

	// Components
	createComponent(name, shape) {
		const component = { ...shape, id: `comp_${Date.now()}` };
		this.components.set(name, component);
	}

	cloneComponent(name, x, y) {
		const component = this.components.get(name);
		if (component) {
			const clone = {
				...component,
				id: `shape_${Date.now()}`,
				x,
				y,
				componentRef: name,
			};
			this.addShape(clone);
			return clone.id;
		}
	}

	updateComponentClones(componentName, property, value) {
		this.shapes.forEach((shape) => {
			if (
				shape.componentRef === componentName &&
				property !== "width" &&
				property !== "height"
			) {
				if (property in shape) {
					shape[property] = value;
				} else {
					shape.styles[property] = value;
				}
			}
		});
		this.redraw();
	}

	// Guides
	addGuide(type, position) {
		this.guides.push({
			type,
			x: type === "vertical" ? position : 0,
			y: type === "horizontal" ? position : 0,
		});
		this.redraw();
	}

	removeGuide(index) {
		this.guides.splice(index, 1);
		this.redraw();
	}

	// Collision Detection
	detectCollisions() {
		const collisions = [];
		for (let i = 0; i < this.shapes.length; i++) {
			for (let j = i + 1; j < this.shapes.length; j++) {
				if (
					this.shapes[i].id !== this.shapes[j].id &&
					this.isOverlapping(this.shapes[i], this.shapes[j])
				) {
					collisions.push([this.shapes[i].id, this.shapes[j].id]);
				}
			}
		}
		return collisions;
	}

	isOverlapping(shape1, shape2) {
		const w1 = this.calculateDimension(
			shape1.width,
			this.canvas.width,
			this.canvas.height
		);
		const h1 = this.calculateDimension(
			shape1.height,
			this.canvas.height,
			this.canvas.height
		);
		const w2 = this.calculateDimension(
			shape2.width,
			this.canvas.width,
			this.canvas.height
		);
		const h2 = this.calculateDimension(
			shape2.height,
			this.canvas.height,
			this.canvas.height
		);
		return (
			shape1.x < shape2.x + w2 &&
			shape1.x + w1 > shape2.x &&
			shape1.y < shape2.y + h2 &&
			shape1.y + h1 > shape2.y
		);
	}

	// Event System
	addEvent(id, eventType, action) {
		const shape = this.getElementById(id);
		if (shape) {
			if (!shape.events) shape.events = {};
			shape.events[eventType] = action;
			this.state.addState([...this.shapes], `Add Event to ${id}`);
		}
	}

	// Zoom and Pan
	setZoom(scale) {
		this.scale = scale;
		this.redraw();
	}

	setPan(x, y) {
		this.panX = x;
		this.panY = y;
		this.redraw();
	}

	// Initialize event listeners
	initEventListeners() {
		this.canvas.addEventListener("mousedown", this.handleMouseDown.bind(this));
		this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
		this.canvas.addEventListener("mouseup", this.handleMouseUp.bind(this));
		this.canvas.addEventListener("dblclick", this.handleDoubleClick.bind(this));
		if (!this.disableZoom)
			this.canvas.addEventListener("wheel", this.handleZoom.bind(this));
		this.canvas.addEventListener("dragover", this.handleDragOver.bind(this));
		this.canvas.addEventListener("drop", this.handleDrop.bind(this));
		this.canvas.addEventListener("keydown", this.handleKeyDown.bind(this));
		this.canvas.addEventListener("wheel", this.handleScroll.bind(this));
	}

	handleMouseDown(e) {
		const { x, y } = this.getMousePos(e);
		this.startX = x;
		this.startY = y;

		const shape = this.findShapeAtPoint(x, y);
		this.resizeHandle = shape ? this.getResizeHandle(x, y, shape) : null;

		if (this.resizeHandle === "rotate" && shape) {
			this.isRotating = true;
			this.selectedShapes = [shape];
		} else if (this.resizeHandle && shape) {
			this.isResizing = true;
			this.selectedShapes = [shape];
		} else if (e.button === 1) {
			// Middle click for panning
			this.isPanning = true;
		} else if (shape) {
			this.isDragging = true;
			if (e.ctrlKey || e.metaKey) {
				if (!this.selectedShapes.includes(shape))
					this.selectedShapes.push(shape);
			} else {
				this.selectedShapes = [shape];
			}

			if (shape.type === "checkbox") {
				shape.checked = !shape.checked;
				this.state.addState([...this.shapes], "Toggle Checkbox");
				this.redraw();
			} else if (shape.type === "selector") {
				const currentIndex = shape.options.indexOf(shape.selectedOption);
				const nextIndex = (currentIndex + 1) % shape.options.length;
				shape.selectedOption = shape.options[nextIndex];
				this.state.addState([...this.shapes], "Change Selector Option");
				this.redraw();
			} else if (shape.events?.onClick) {
				eval(shape.events.onClick); // Execute click event (unsafe, consider safer alternatives)
				this.redraw();
			}
		} else if (this.currentShape) {
			this.isDrawing = true;
			this.selectedShapes = [];
			const createShapePromise = [
				"input",
				"checkbox",
				"selector",
				"div",
				"table",
				"button",
				"icon",
				"image",
				"video",
				"scroll",
				"board",
				"path",
			].includes(this.currentShape)
				? this.createSpecialShape(this.currentShape, x, y)
				: Promise.resolve(this.createShape(this.currentShape, x, y));
			createShapePromise.then((newShape) => {
				const parent = this.findContainerAtPoint(x, y);
				this.addShape(newShape, parent?.id);
			});
		} else {
			this.selectedShapes = [];
		}
		this.redraw();
	}

	handleMouseMove(e) {
		const { x, y } = this.getMousePos(e);

		// Update hover handle and cursor
		const shape = this.selectedShapes[0];
		if (shape) {
			this.hoverHandle = this.getResizeHandle(x, y, shape);
			this.canvas.style.cursor = this.hoverHandle
				? this.getCursorForHandle(this.hoverHandle)
				: "default";
			this.redraw();
		}

		// Handle rotation
		if (this.isRotating && shape) {
			const centerX =
				shape.x +
				this.calculateDimension(
					shape.width,
					this.canvas.width,
					this.canvas.height
				) /
					2;
			const centerY =
				shape.y +
				this.calculateDimension(
					shape.height,
					this.canvas.height,
					this.canvas.height
				) /
					2;
			const angle = (Math.atan2(y - centerY, x - centerX) * 180) / Math.PI;
			shape.styles.transform = `rotate(${angle + 90}deg)`;
			this.redraw();
		}
		// Handle resizing
		else if (this.isResizing && shape) {
			this.resizeShape(shape, x, y, this.resizeHandle);
			this.restrictWithinParent(shape);
			this.redraw();
		}
		// Handle dragging
		else if (this.isDragging && this.selectedShapes.length) {
			const dx = x - this.startX;
			const dy = y - this.startY;
			this.selectedShapes.forEach((shape) => {
				shape.x += dx;
				shape.y += dy;
				if (this.snapToGrid) {
					shape.x = Math.round(shape.x / this.gridSize) * this.gridSize;
					shape.y = Math.round(shape.y / this.gridSize) * this.gridSize;
				}
				this.restrictWithinParent(shape);
				// Smart guides: Suggest spacing
				this.showSmartGuides(shape);
			});
			this.startX = x;
			this.startY = y;
			this.redraw();
		}
		// Handle drawing
		else if (this.isDrawing && this.currentShape) {
			const shape =
				this.shapes[this.shapes.length - 1] || this.selectedShapes[0];
			if (this.currentShape === "path") {
				this.pathPoints.push({ x: x - shape.x, y: y - shape.y });
				shape.pathData = this.generatePathData();
			} else {
				this.updateShapeDimensions(shape, x, y);
			}
			this.restrictWithinParent(shape);
			this.redraw();
		}
		// Handle panning
		else if (this.isPanning) {
			this.panX += x - this.startX;
			this.panY += y - this.startY;
			this.startX = x;
			this.startY = y;
			this.redraw();
		}
	}

	handleMouseUp(e) {
		const { x, y } = this.getMousePos(e);
		if (this.isDragging && this.selectedShapes.length) {
			const target = this.findContainerAtPoint(x, y, true);
			if (
				target &&
				["div", "scroll", "board"].includes(target.type) &&
				!this.selectedShapes.includes(target)
			) {
				this.selectedShapes.forEach((shape) =>
					this.nestElement(target.id, shape.id)
				);
			}
		}
		if (this.isDrawing && this.currentShape === "path") {
			this.pathPoints = [];
		}
		if (
			this.isDrawing ||
			this.isDragging ||
			this.isResizing ||
			this.isRotating ||
			this.isPanning
		) {
			this.isDrawing = false;
			this.isDragging = false;
			this.isResizing = false;
			this.isRotating = false;
			this.isPanning = false;
			this.currentShape = null;
			this.resizeHandle = null;
			this.state.addState([...this.shapes], "Finish Interaction");
		}
		this.canvas.style.cursor = "default";
		this.redraw();
	}

	handleDoubleClick(e) {
		const { x, y } = this.getMousePos(e);
		const shape = this.findShapeAtPoint(x, y);
		if (shape && shape.type === "text") {
			this.startTextEditing(shape);
		}
	}

	startTextEditing(shape) {
		const parent = this.getParent(shape);
		const parentWidth = parent
			? this.calculateDimension(
					parent.width,
					this.canvas.width,
					this.canvas.height
			  )
			: this.canvas.width;
		const parentHeight = parent
			? this.calculateDimension(
					parent.height,
					this.canvas.height,
					this.canvas.height
			  )
			: this.canvas.height;
		const width = this.calculateDimension(
			shape.width,
			parentWidth,
			parentHeight
		);
		const height = this.calculateDimension(
			shape.height,
			parentWidth,
			parentHeight
		);
		const input = document.createElement("input");
		input.type = "text";
		input.value = shape.text || "";
		input.style.position = "absolute";
		input.style.left = `${this.canvas.offsetLeft + shape.x}px`;
		input.style.top = `${this.canvas.offsetTop + shape.y}px`;
		input.style.width = `${width}px`;
		input.style.height = `${height}px`;
		input.style.fontSize = shape.styles.fontSize;
		input.style.fontFamily = shape.styles.fontFamily;
		input.style.color = shape.styles.color;
		document.body.appendChild(input);
		input.focus();

		const finishEditing = () => {
			shape.text = input.value;
			document.body.removeChild(input);
			this.state.addState([...this.shapes], "Edit Text");
			this.redraw();
		};

		input.addEventListener("blur", finishEditing);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") finishEditing();
		});
	}

	handleZoom(e) {
		if (this.disableZoom) return;
		e.preventDefault();
		const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
		this.scale *= zoomFactor;
		this.scale = Math.max(0.1, Math.min(this.scale, 5)); // Limit zoom
		this.redraw();
	}

	handleDragOver(e) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "copy";
	}

	handleDrop(e) {
		e.preventDefault();
		const { x, y } = this.getMousePos(e);
		const type = e.dataTransfer.getData("type");
		if (type) {
			const createShapePromise = [
				"input",
				"checkbox",
				"selector",
				"div",
				"table",
				"button",
				"icon",
				"image",
				"video",
				"scroll",
				"board",
				"path",
			].includes(type)
				? this.createSpecialShape(type, x, y)
				: Promise.resolve(this.createShape(type, x, y));
			createShapePromise.then((newShape) => {
				const parent = this.findContainerAtPoint(x, y);
				this.addShape(newShape, parent?.id);
			});
		}
	}

	handleKeyDown(e) {
		if (!this.canvas.matches(":focus")) return;
		const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
		const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

		if (ctrlKey && e.key === "z") {
			e.preventDefault();
			this.undo();
		} else if (ctrlKey && e.key === "y") {
			e.preventDefault();
			this.redo();
		} else if (ctrlKey && e.key === "c") {
			e.preventDefault();
			this.copySelected();
		} else if (ctrlKey && e.key === "v") {
			e.preventDefault();
			this.pasteClipboard();
		}
	}

	handleScroll(e) {
		const { x, y } = this.getMousePos(e);
		const shape = this.findShapeAtPoint(x, y);
		if (shape && shape.type === "scroll" && shape.children?.length) {
			e.preventDefault();
			const direction = shape.scrollDirection || "column";
			const contentWidth = shape.children.reduce(
				(sum, child) =>
					direction === "row"
						? sum +
						  this.calculateDimension(
								child.width,
								this.canvas.width,
								this.canvas.height
						  )
						: this.calculateDimension(
								child.width,
								this.canvas.width,
								this.canvas.height
						  ),
				0
			);
			const contentHeight = shape.children.reduce(
				(sum, child) =>
					direction === "column"
						? sum +
						  this.calculateDimension(
								child.height,
								this.canvas.width,
								this.canvas.height
						  )
						: this.calculateDimension(
								child.height,
								this.canvas.width,
								this.canvas.height
						  ),
				0
			);
			const width = this.calculateDimension(
				shape.width,
				this.canvas.width,
				this.canvas.height
			);
			const height = this.calculateDimension(
				shape.height,
				this.canvas.height,
				this.canvas.height
			);

			let scrollOffset = this.scrollOffsets.get(shape.id) || 0;
			const delta = e.deltaY > 0 ? 20 : -20;
			scrollOffset = Math.max(
				0,
				Math.min(
					scrollOffset + delta,
					direction === "column" ? contentHeight - height : contentWidth - width
				)
			);
			this.scrollOffsets.set(shape.id, scrollOffset);
			this.state.addState([...this.shapes], "Scroll");
			this.redraw();
		}
	}

	getMousePos(e) {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x:
				((e.clientX - rect.left) * (this.canvas.width / rect.width) -
					this.panX) /
				this.scale,
			y:
				((e.clientY - rect.top) * (this.canvas.height / rect.height) -
					this.panY) /
				this.scale,
		};
	}

	findShapeAtPoint(x, y, excludeSelected = false) {
		for (let i = this.shapes.length - 1; i >= 0; i--) {
			const shape = this.shapes[i];
			if (excludeSelected && this.selectedShapes.includes(shape)) continue;
			if (this.isPointInShape(x, y, shape)) {
				if (shape.type === "div" && shape.children?.length) {
					const nested = this.findNestedShapeAtPoint(
						x,
						y,
						shape.children,
						shape
					);
					return nested || shape;
				}
				return shape;
			}
		}
		return null;
	}

	findNestedShapeAtPoint(x, y, children, parent) {
		const parentX = parent.x;
		const parentY = parent.y;
		for (let i = children.length - 1; i >= 0; i--) {
			const shape = children[i];
			const absX = shape.x + parentX;
			const absY = shape.y + parentY;
			if (this.isPointInShape(x - parentX, y - parentY, shape)) return shape;
			if (shape.children) {
				const nested = this.findNestedShapeAtPoint(x, y, shape.children, {
					x: absX,
					y: absY,
				});
				if (nested) return nested;
			}
		}
		return null;
	}

	findContainerAtPoint(x, y, excludeSelected = false) {
		for (let i = this.shapes.length - 1; i >= 0; i--) {
			const shape = this.shapes[i];
			if (excludeSelected && this.selectedShapes.includes(shape)) continue;
			if (
				["div", "scroll", "board"].includes(shape.type) &&
				this.isPointInShape(x, y, shape)
			)
				return shape;
		}
		return null;
	}

	isPointInShape(x, y, shape) {
		const parent = this.getParent(shape);
		const parentWidth = parent
			? this.calculateDimension(
					parent.width,
					this.canvas.width,
					this.canvas.height
			  )
			: this.canvas.width;
		const parentHeight = parent
			? this.calculateDimension(
					parent.height,
					this.canvas.height,
					this.canvas.height
			  )
			: this.canvas.height;
		const width = this.calculateDimension(
			shape.width,
			parentWidth,
			parentHeight
		);
		const height = this.calculateDimension(
			shape.height,
			parentWidth,
			parentHeight
		);
		const rotated = this.rotatePoint(
			x,
			y,
			shape.x + width / 2,
			shape.y + height / 2,
			this.getRotationAngle(shape)
		);
		return (
			rotated.x >= shape.x &&
			rotated.x <= shape.x + width &&
			rotated.y >= shape.y &&
			rotated.y <= shape.y + height
		);
	}

	rotatePoint(x, y, cx, cy, angle) {
		const radians = (angle * Math.PI) / 180;
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		const nx = cos * (x - cx) + sin * (y - cy) + cx;
		const ny = cos * (y - cy) - sin * (x - cx) + cy;
		return { x: nx, y: ny };
	}

	getRotationAngle(shape) {
		const transform = shape.styles.transform || "rotate(0deg)";
		const match = transform.match(/rotate\(([^)]+)\)/);
		return match ? parseFloat(match[1]) : 0;
	}

	getResizeHandle(x, y, shape) {
		const parent = this.getParent(shape);
		const parentWidth = parent
			? this.calculateDimension(
					parent.width,
					this.canvas.width,
					this.canvas.height
			  )
			: this.canvas.width;
		const parentHeight = parent
			? this.calculateDimension(
					parent.height,
					this.canvas.height,
					this.canvas.height
			  )
			: this.canvas.height;
		const width = this.calculateDimension(
			shape.width,
			parentWidth,
			parentHeight
		);
		const height = this.calculateDimension(
			shape.height,
			parentWidth,
			parentHeight
		);
		const handles = [
			{ pos: "se", x: shape.x + width - 5, y: shape.y + height - 5, size: 10 },
			{ pos: "sw", x: shape.x - 5, y: shape.y + height - 5, size: 10 },
			{ pos: "ne", x: shape.x + width - 5, y: shape.y - 5, size: 10 },
			{ pos: "nw", x: shape.x - 5, y: shape.y - 5, size: 10 },
			{ pos: "n", x: shape.x + width / 2 - 5, y: shape.y - 5, size: 10 },
			{
				pos: "s",
				x: shape.x + width / 2 - 5,
				y: shape.y + height - 5,
				size: 10,
			},
			{
				pos: "e",
				x: shape.x + width - 5,
				y: shape.y + height / 2 - 5,
				size: 10,
			},
			{ pos: "w", x: shape.x - 5, y: shape.y + height / 2 - 5, size: 10 },
			{ pos: "rotate", x: shape.x + width / 2 - 5, y: shape.y - 25, size: 10 },
		];
		return (
			handles.find(
				(h) => x >= h.x && x <= h.x + h.size && y >= h.y && y <= h.y + h.size
			)?.pos || null
		);
	}

	resizeShape(shape, x, y, handle) {
		const parent = this.getParent(shape);
		const parentWidth = parent
			? this.calculateDimension(
					parent.width,
					this.canvas.width,
					this.canvas.height
			  )
			: this.canvas.width;
		const parentHeight = parent
			? this.calculateDimension(
					parent.height,
					this.canvas.height,
					this.canvas.height
			  )
			: this.canvas.height;
		const currentWidth = this.calculateDimension(
			shape.width,
			parentWidth,
			parentHeight
		);
		const currentHeight = this.calculateDimension(
			shape.height,
			parentWidth,
			parentHeight
		);

		switch (handle) {
			case "se":
				shape.width = `${x - shape.x}px`;
				shape.height = `${y - shape.y}px`;
				break;
			case "sw":
				shape.width = `${shape.x + currentWidth - x}px`;
				shape.x = x;
				shape.height = `${y - shape.y}px`;
				break;
			case "ne":
				shape.width = `${x - shape.x}px`;
				shape.height = `${shape.y + currentHeight - y}px`;
				shape.y = y;
				break;
			case "nw":
				shape.width = `${shape.x + currentWidth - x}px`;
				shape.height = `${shape.y + currentHeight - y}px`;
				shape.x = x;
				shape.y = y;
				break;
			case "n":
				shape.height = `${shape.y + currentHeight - y}px`;
				shape.y = y;
				break;
			case "s":
				shape.height = `${y - shape.y}px`;
				break;
			case "e":
				shape.width = `${x - shape.x}px`;
				break;
			case "w":
				shape.width = `${shape.x + currentWidth - x}px`;
				shape.x = x;
				break;
		}
		// Ensure minimum dimensions
		shape.width = `${Math.max(
			parseFloat(shape.width) || 0,
			parseFloat(shape.styles.minWidth)
		)}px`;
		shape.height = `${Math.max(
			parseFloat(shape.height) || 0,
			parseFloat(shape.styles.minHeight)
		)}px`;
	}

	// Restrict shape within its parent's bounds
	restrictWithinParent(shape, parent = null) {
		if (!parent) parent = this.getParent(shape);
		if (!parent) return;

		const parentWidth = this.calculateDimension(
			parent.width,
			this.canvas.width,
			this.canvas.height
		);
		const parentHeight = this.calculateDimension(
			parent.height,
			this.canvas.height,
			this.canvas.height
		);
		const width = this.calculateDimension(
			shape.width,
			parentWidth,
			parentHeight
		);
		const height = this.calculateDimension(
			shape.height,
			parentWidth,
			parentHeight
		);

		shape.x = Math.max(0, Math.min(shape.x, parentWidth - width));
		shape.y = Math.max(0, Math.min(shape.y, parentHeight - height));
	}

	// Get the parent of a shape
	getParent(shape) {
		return this.findParent(this.shapes, shape.id);
	}

	// Recursively find the parent of a shape by ID
	findParent(shapes, id) {
		for (const shape of shapes) {
			if (shape.children) {
				if (shape.children.some((child) => child.id === id)) return shape;
				const found = this.findParent(shape.children, id);
				if (found) return found;
			}
		}
		return null;
	}

	// Find a shape recursively by ID
	findNestedShape(id, shapes) {
		for (const shape of shapes) {
			if (shape.id === id) return shape;
			if (shape.children) {
				const found = this.findNestedShape(id, shape.children);
				if (found) return found;
			}
		}
		return null;
	}

	// Get the common parent of multiple shapes
	getCommonParent(shapes) {
		if (!shapes.length) return null;
		const parents = shapes.map((shape) => this.getParent(shape));
		if (parents.every((p) => p === null)) return null;
		const uniqueParents = [...new Set(parents.filter((p) => p))];
		return uniqueParents.length === 1 ? uniqueParents[0] : null;
	}

	// Update shape dimensions during drawing
	updateShapeDimensions(shape, x, y) {
		if (!shape) return;
		shape.width = `${Math.abs(x - shape.x)}px`;
		shape.height = `${Math.abs(y - shape.y)}px`;
		if (x < shape.x) shape.x = x;
		if (y < shape.y) shape.y = y;
	}

	// Generate path data from points (for path drawing)
	generatePathData() {
		if (!this.pathPoints.length) return "";
		let pathData = `M${this.pathPoints[0].x},${this.pathPoints[0].y}`;
		for (let i = 1; i < this.pathPoints.length; i++) {
			pathData += ` L${this.pathPoints[i].x},${this.pathPoints[i].y}`;
		}
		return pathData;
	}

	// Show smart guides for spacing feedback
	showSmartGuides(shape) {
		this.ctx.save();
		this.ctx.strokeStyle = "#ff00ff";
		this.ctx.lineWidth = 1 / this.scale;
		this.shapes.forEach((other) => {
			if (other !== shape && !this.selectedShapes.includes(other)) {
				const parent = this.getParent(shape) || { x: 0, y: 0 };
				const shapeX = shape.x + parent.x;
				const shapeY = shape.y + parent.y;
				const otherX = other.x + (this.getParent(other)?.x || 0);
				const otherY = other.y + (this.getParent(other)?.y || 0);
				const shapeWidth = this.calculateDimension(
					shape.width,
					this.canvas.width,
					this.canvas.height
				);
				const shapeHeight = this.calculateDimension(
					shape.height,
					this.canvas.height,
					this.canvas.height
				);
				const otherWidth = this.calculateDimension(
					other.width,
					this.canvas.width,
					this.canvas.height
				);
				const otherHeight = this.calculateDimension(
					other.height,
					this.canvas.height,
					this.canvas.height
				);

				// Horizontal spacing
				if (Math.abs(shapeY - otherY) < 5) {
					this.ctx.beginPath();
					this.ctx.moveTo(shapeX + shapeWidth, shapeY);
					this.ctx.lineTo(otherX, otherY);
					this.ctx.stroke();
				}
				// Vertical spacing
				if (Math.abs(shapeX - otherX) < 5) {
					this.ctx.beginPath();
					this.ctx.moveTo(shapeX, shapeY + shapeHeight);
					this.ctx.lineTo(otherX, otherY);
					this.ctx.stroke();
				}
			}
		});
		this.ctx.restore();
	}

	// Create a basic shape object
	createShape(type, x, y) {
		const defaults = this.getAcceptedTypes().find((t) => t.type === type) || {};
		return {
			id: `shape_${Date.now()}`,
			type,
			x,
			y,
			width: defaults.width || "50px",
			height: defaults.height || "50px",
			styles: { ...AdvancedStyles },
			children: [],
			frames: [],
			events: {},
			...(type === "text" && { text: "Double click to edit" }),
			...(type === "circle" && { radius: 25 }),
			...(type === "line" && { x2: x, y2: y }),
			...(type === "triangle" && {
				points: [
					{ x: 0, y: 0 },
					{ x: 50, y: 0 },
					{ x: 25, y: -50 },
				],
			}),
		};
	}
}

// Export the class for use
if (typeof module !== "undefined" && module.exports) {
	module.exports = CanvasManipulator;
} else {
	window.CanvasManipulator = CanvasManipulator;
}