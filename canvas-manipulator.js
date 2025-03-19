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
	marginTop: 0,
	marginRight: 0,
	marginBottom: 0,
	marginLeft: 0,
	padding: 0,
	paddingTop: 0,
	paddingRight: 0,
	paddingBottom: 0,
	paddingLeft: 0,
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
	overflowX: "hidden",
	overflowY: "hidden",
};

// Main class for manipulating the canvas
class CanvasManipulator {
	constructor(canvasIdOrElement, settings = {}) {
		// Private properties
		this.isExternalCanvas = typeof canvasIdOrElement !== "string";
		this.canvas = this.isExternalCanvas
			? canvasIdOrElement
			: document.getElementById(canvasIdOrElement) || this.createCanvas();
		this.ctx = this.canvas.getContext("2d");
		this.state = new StateManager("canvasState");
		this.isDrawing = false;
		this.isDragging = false;
		this.isResizing = false;
		this.isRotating = false;
		this.currentShape = null;
		this.selectedShapes = [];
		this.shapes = [];
		this.startX = 0;
		this.startY = 0;
		this.resizeHandle = null;
		this.htmlElements = new Map();
		this.showOverlay =
			settings.showOverlay !== undefined ? settings.showOverlay : false;
		this.disableZoom =
			settings.disableZoom !== undefined ? settings.disableZoom : false;
		this.settings = {
			width: settings.width || 800,
			height: settings.height || 600,
			backgroundColor: settings.backgroundColor || "#ffffff",
			...settings,
		};
		this.animationFrames = new Map();
		this.currentFrameIndex = new Map();
		this.timelineCanvas = null;
		this.timelineCtx = null;
		this.timelineDragging = false;
		this.selectedKeyframeIndex = null;
		this.pausedAnimations = new Set();

		// Initialize canvas
		this.canvas.width = this.settings.width;
		this.canvas.height = this.settings.height;
		this.canvas.tabIndex = 0;

		// Setup
		this.initEventListeners();
		this.shapes = this.state.load() || [];
		this.shapes.forEach((shape) => {
			if (["html", "flex", "grid", "scroll"].includes(shape.type))
				this.createDomElement(shape);
		});
		this.redraw();

		// Cleanup on unload
		window.addEventListener("beforeunload", () => this.state.clear());
	}

	// Creates a new canvas element
	createCanvas() {
		const canvas = document.createElement("canvas");
		document.body.appendChild(canvas);
		return canvas;
	}

	// Calculates pixel value from string (handles %, vh, vw, px)
	calculateDimension(value, parentDimension, viewportDimension) {
		if (value === "auto") return parentDimension;
		if (value.endsWith("%")) {
			return (parseFloat(value) / 100) * parentDimension;
		}
		if (value.endsWith("vh")) {
			return (parseFloat(value) / 100) * viewportDimension;
		}
		if (value.endsWith("vw")) {
			return (parseFloat(value) / 100) * window.innerWidth;
		}
		return parseFloat(value) || 0;
	}

	/**
	 * Gets the underlying HTMLCanvasElement
	 * @returns The canvas element
	 */
	getCanvas() {
		return this.canvas;
	}

	/**
	 * Gets a shape by its ID, including nested shapes
	 * @param id - The ID of the shape to find
	 * @returns The shape if found, null otherwise
	 */
	getElementById(id) {
		return (
			this.shapes.find((s) => s.id === id) ||
			this.findNestedShape(id, this.shapes)
		);
	}

	/**
	 * Exports the canvas content as an image
	 * @param format - The desired export format ('png' or 'jpg')
	 * @param quality - Quality for lossy formats (0 to 1, default 0.92)
	 * @returns Data URL of the exported image
	 */
	exportCanvas(format, quality = 0.92) {
		return this.canvas.toDataURL(`image/${format}`, quality);
	}

	/**
	 * Plays the animation for a shape from the current frame
	 * @param id - The ID of the shape to animate
	 */
	playAnimation(id) {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || shape.frames.length === 0) return;

		this.stopAnimation(id);
		this.pausedAnimations.delete(id);
		let frameIndex = this.currentFrameIndex.get(id) || 0;

		const animate = (timestamp) => {
			if (this.pausedAnimations.has(id) || frameIndex >= shape.frames.length) {
				this.animationFrames.delete(id);
				return;
			}

			const frame = shape.frames[frameIndex];
			shape.x = frame.x;
			shape.y = frame.y;
			shape.styles.transform = `rotate(${frame.rotation}deg)`;
			this.currentFrameIndex.set(id, frameIndex);
			this.updateDomElement(shape);
			this.redraw();
			this.updateTimeline();

			frameIndex++;
			setTimeout(() => {
				const frameId = requestAnimationFrame(animate);
				this.animationFrames.set(id, frameId);
			}, frame.duration);
		};

		const frameId = requestAnimationFrame(animate);
		this.animationFrames.set(id, frameId);
	}

	/**
	 * Pauses the animation for a shape
	 * @param id - The ID of the shape to pause
	 */
	pauseAnimation(id) {
		if (this.animationFrames.has(id)) {
			this.pausedAnimations.add(id);
		}
	}

	/**
	 * Gets the current keyframe for a shape
	 * @param id - The ID of the shape
	 * @returns The current keyframe or null if none
	 */
	getCurrentKeyframe(id) {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || shape.frames.length === 0) return null;

		const frameIndex = this.currentFrameIndex.get(id) || 0;
		return shape.frames[frameIndex] || null;
	}

	/**
	 * Calculates the total duration of all keyframes for a shape
	 * @param id - The ID of the shape
	 * @returns Total duration in milliseconds
	 */
	getTotalAnimationDuration(id) {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || shape.frames.length === 0) return 0;
		return shape.frames.reduce((sum, frame) => sum + frame.duration, 0);
	}

	/**
	 * Sets keyframes per second for a shape's animation
	 * @param id - The ID of the shape
	 * @param fps - Frames per second to set
	 */
	setKeyframesPerSecond(id, fps) {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || shape.frames.length === 0 || fps <= 0)
			return;

		const frameDuration = 1000 / fps;
		shape.frames = shape.frames.map((frame) => ({
			...frame,
			duration: frameDuration,
		}));
		this.state.addState([...this.shapes]);
		this.updateTimeline(id);
	}

	/**
	 * Creates an interactive keyframe timeline for a shape
	 * @param shapeId - The ID of the shape to create a timeline for
	 * @param width - Width of the timeline canvas (default 400)
	 * @param height - Height of the timeline canvas (default 50)
	 * @returns The timeline canvas element
	 */
	createKeyframeTimeline(shapeId, width = 400, height = 50) {
		const shape = this.getElementById(shapeId);
		if (!shape || !shape.frames || shape.frames.length === 0) {
			throw new Error("Shape not found or has no frames");
		}

		if (this.timelineCanvas) {
			this.timelineCanvas.remove();
		}

		this.timelineCanvas = document.createElement("canvas");
		this.timelineCanvas.width = width;
		this.timelineCanvas.height = height;
		this.timelineCanvas.style.border = "1px solid #000";
		this.timelineCanvas.style.position = "absolute";
		this.timelineCanvas.style.bottom = "10px";
		this.timelineCanvas.style.left = "10px";
		document
			.getElementById("timeline-container")
			.appendChild(this.timelineCanvas);
		this.timelineCtx = this.timelineCanvas.getContext("2d");

		this.updateTimeline(shapeId);

		this.timelineCanvas.addEventListener("mousedown", (e) =>
			this.handleTimelineMouseDown(e, shapeId)
		);
		this.timelineCanvas.addEventListener("mousemove", (e) =>
			this.handleTimelineMouseMove(e, shapeId)
		);
		this.timelineCanvas.addEventListener("mouseup", () =>
			this.handleTimelineMouseUp()
		);

		return this.timelineCanvas;
	}

	// Updates the timeline visualization
	updateTimeline(shapeId = this.selectedShapes[0]?.id || "") {
		if (!this.timelineCanvas || !this.timelineCtx || !shapeId) return;

		const shape = this.getElementById(shapeId);
		if (!shape || !shape.frames) return;

		this.timelineCtx.clearRect(
			0,
			0,
			this.timelineCanvas.width,
			this.timelineCanvas.height
		);
		this.timelineCtx.fillStyle = "#f0f0f0";
		this.timelineCtx.fillRect(
			0,
			0,
			this.timelineCanvas.width,
			this.timelineCanvas.height
		);

		const frameWidth = this.timelineCanvas.width / shape.frames.length;

		shape.frames.forEach((frame, index) => {
			const x = index * frameWidth;
			this.timelineCtx.fillStyle =
				index === this.currentFrameIndex.get(shapeId) ? "#ff0000" : "#0000ff";
			this.timelineCtx.fillRect(x, 10, 5, this.timelineCanvas.height - 20);
		});

		const currentIndex = this.currentFrameIndex.get(shapeId) || 0;
		const playheadX = currentIndex * frameWidth;
		this.timelineCtx.strokeStyle = "#00ff00";
		this.timelineCtx.lineWidth = 2;
		this.timelineCtx.beginPath();
		this.timelineCtx.moveTo(playheadX, 0);
		this.timelineCtx.lineTo(playheadX, this.timelineCanvas.height);
		this.timelineCtx.stroke();
	}

	// Handles timeline mousedown to select or drag playhead
	handleTimelineMouseDown(e, shapeId) {
		const rect = this.timelineCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const frameWidth =
			this.timelineCanvas.width /
			(this.getElementById(shapeId).frames.length || 1);
		const frameIndex = Math.floor(x / frameWidth);

		this.selectedKeyframeIndex = frameIndex;
		this.currentFrameIndex.set(shapeId, frameIndex);
		this.timelineDragging = true;
		this.updateTimeline(shapeId);
	}

	// Handles timeline mousemove for dragging playhead
	handleTimelineMouseMove(e, shapeId) {
		if (!this.timelineDragging || !this.timelineCanvas) return;

		const rect = this.timelineCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const frameWidth =
			this.timelineCanvas.width /
			(this.getElementById(shapeId).frames.length || 1);
		const frameIndex = Math.max(
			0,
			Math.min(
				Math.floor(x / frameWidth),
				this.getElementById(shapeId).frames.length - 1
			)
		);

		this.currentFrameIndex.set(shapeId, frameIndex);
		const shape = this.getElementById(shapeId);
		const frame = shape.frames[frameIndex];
		shape.x = frame.x;
		shape.y = frame.y;
		shape.styles.transform = `rotate(${frame.rotation}deg)`;
		this.updateDomElement(shape);
		this.redraw();
		this.updateTimeline(shapeId);
	}

	// Handles timeline mouseup to end dragging
	handleTimelineMouseUp() {
		this.timelineDragging = false;
	}

	/**
	 * Edits the selected keyframe of a shape
	 * @param shapeId - The ID of the shape
	 * @param newFrame - New frame data (x, y, rotation, duration)
	 */
	editSelectedKeyframe(shapeId, newFrame) {
		const shape = this.getElementById(shapeId);
		if (!shape || !shape.frames || this.selectedKeyframeIndex === null) return;

		const frame = shape.frames[this.selectedKeyframeIndex];
		shape.frames[this.selectedKeyframeIndex] = {
			x: newFrame.x !== undefined ? newFrame.x : frame.x,
			y: newFrame.y !== undefined ? newFrame.y : frame.y,
			rotation:
				newFrame.rotation !== undefined ? newFrame.rotation : frame.rotation,
			duration:
				newFrame.duration !== undefined ? newFrame.duration : frame.duration,
		};

		this.state.addState([...this.shapes]);
		this.updateTimeline(shapeId);
		this.redraw();
	}

	// Initializes event listeners for canvas interactions
	initEventListeners() {
		this.canvas.addEventListener("mousedown", this.handleMouseDown.bind(this));
		this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
		this.canvas.addEventListener("mouseup", this.handleMouseUp.bind(this));
		if (!this.disableZoom) {
			this.canvas.addEventListener("wheel", this.handleZoom.bind(this));
		}
		this.canvas.addEventListener("dragover", this.handleDragOver.bind(this));
		this.canvas.addEventListener("drop", this.handleDrop.bind(this));
		this.canvas.addEventListener("keydown", this.handleKeyDown.bind(this));
	}

	// Handles keydown events for undo/redo
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
		}
	}

	// Handles mouse down events for drawing/dragging/resizing
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
		} else if (shape) {
			this.isDragging = true;
			if (e.ctrlKey || e.metaKey) {
				if (!this.selectedShapes.includes(shape)) {
					this.selectedShapes.push(shape);
				}
			} else {
				this.selectedShapes = [shape];
			}
		} else if (this.currentShape) {
			this.isDrawing = true;
			this.selectedShapes = [];
			const newShape = this.createShape(this.currentShape, x, y);
			this.shapes.push(newShape);
			this.state.addState([...this.shapes]);
			if (["html", "flex", "grid", "scroll"].includes(newShape.type))
				this.createDomElement(newShape);
		} else {
			this.selectedShapes = [];
		}
		this.redraw();
		this.updateTimeline();
	}

	// Handles mouse move events for drawing/dragging/resizing/rotating
	handleMouseMove(e) {
		const { x, y } = this.getMousePos(e);

		if (this.isRotating && this.selectedShapes[0]) {
			const shape = this.selectedShapes[0];
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
			this.updateDomElement(shape);
			this.updateNestedElements(shape);
			this.redraw();
		} else if (this.isResizing && this.selectedShapes[0]) {
			const shape = this.selectedShapes[0];
			this.resizeShape(shape, x, y, this.resizeHandle);
			this.restrictWithinBounds(shape);
			this.updateDomElement(shape);
			this.updateNestedElements(shape);
			this.redraw();
		} else if (this.isDragging && this.selectedShapes.length) {
			const dx = x - this.startX;
			const dy = y - this.startY;
			this.selectedShapes.forEach((shape) => {
				shape.x += dx;
				shape.y += dy;
				this.restrictWithinBounds(shape);
				this.updateDomElement(shape);
				this.updateNestedElements(shape);
			});
			this.startX = x;
			this.startY = y;
			this.redraw();
		} else if (this.isDrawing && this.currentShape) {
			const shape = this.shapes[this.shapes.length - 1];
			this.updateShapeDimensions(shape, x, y);
			this.restrictWithinBounds(shape);
			this.updateDomElement(shape);
			this.redraw();
		}
		this.updateTimeline();
	}

	// Handles mouse up events to end interactions
	handleMouseUp() {
		if (
			this.isDrawing ||
			this.isDragging ||
			this.isResizing ||
			this.isRotating
		) {
			this.isDrawing = false;
			this.isDragging = false;
			this.isResizing = false;
			this.isRotating = false;
			this.currentShape = null;
			this.resizeHandle = null;
			this.state.addState([...this.shapes]);
		}
		this.updateTimeline();
	}

	// Handles zoom events via mouse wheel
	handleZoom(e) {
		if (this.disableZoom) return;
		e.preventDefault();
		const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
		const currentScale =
			parseFloat(
				this.canvas.style.transform.replace("scale(", "").replace(")", "")
			) || 1;
		this.canvas.style.transform = `scale(${zoomFactor * currentScale})`;
	}

	// Handles drag over events for drag-and-drop
	handleDragOver(e) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "copy";
	}

	// Handles drop events for drag-and-drop
	handleDrop(e) {
		e.preventDefault();
		const { x, y } = this.getMousePos(e);
		const type = e.dataTransfer.getData("type");
		if (type) {
			const newShape = this.createShape(type, x, y);
			this.shapes.push(newShape);
			this.state.addState([...this.shapes]);
			if (["html", "flex", "grid", "scroll"].includes(newShape.type))
				this.createDomElement(newShape);
			this.redraw();
		}
	}

	// Gets mouse position relative to canvas
	getMousePos(e) {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
			y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
		};
	}

	// Finds shape at a specific point
	findShapeAtPoint(x, y) {
		for (let i = this.shapes.length - 1; i >= 0; i--) {
			const shape = this.shapes[i];
			if (this.isPointInShape(x, y, shape)) return shape;
			if (shape.children) {
				const nestedShape = this.findNestedShapeAtPoint(x, y, shape.children);
				if (nestedShape) return nestedShape;
			}
		}
		return null;
	}

	// Finds nested shape at a specific point
	findNestedShapeAtPoint(x, y, children) {
		for (let i = children.length - 1; i >= 0; i--) {
			const shape = children[i];
			if (this.isPointInShape(x, y, shape)) return shape;
			if (shape.children) {
				const nested = this.findNestedShapeAtPoint(x, y, shape.children);
				if (nested) return nested;
			}
		}
		return null;
	}

	// Checks if a point is within a shape
	isPointInShape(x, y, shape) {
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

	// Rotates a point around a center
	rotatePoint(x, y, cx, cy, angle) {
		const radians = (angle * Math.PI) / 180;
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		const nx = cos * (x - cx) + sin * (y - cy) + cx;
		const ny = cos * (y - cy) - sin * (x - cx) + cy;
		return { x: nx, y: ny };
	}

	// Gets rotation angle from transform style
	getRotationAngle(shape) {
		const transform = shape.styles.transform || "rotate(0deg)";
		const match = transform.match(/rotate\(([^)]+)\)/);
		return match ? parseFloat(match[1]) : 0;
	}

	// Gets resize handle at a point
	getResizeHandle(x, y, shape) {
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

	// Resizes a shape based on handle
	resizeShape(shape, x, y, handle) {
		const currentWidth = this.calculateDimension(
			shape.width,
			this.canvas.width,
			this.canvas.height
		);
		const currentHeight = this.calculateDimension(
			shape.height,
			this.canvas.height,
			this.canvas.height
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
				shape.x = x;
				shape.height = `${shape.y + currentHeight - y}px`;
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

		const newWidth = this.calculateDimension(
			shape.width,
			this.canvas.width,
			this.canvas.height
		);
		const newHeight = this.calculateDimension(
			shape.height,
			this.canvas.height,
			this.canvas.height
		);
		if (newWidth < 10) shape.width = "10px";
		if (newHeight < 10) shape.height = "10px";
		if (shape.type === "circle")
			shape.radius = Math.min(newWidth, newHeight) / 2;
	}

	// Restricts shape within canvas bounds
	restrictWithinBounds(shape) {
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
		shape.x = Math.max(0, Math.min(shape.x, this.canvas.width - width));
		shape.y = Math.max(0, Math.min(shape.y, this.canvas.height - height));
	}

	// Creates a new shape
	createShape(type, x, y) {
		const id = Date.now().toString();
		const baseProps = {
			id,
			type,
			x,
			y,
			width: type === "line" ? "0px" : "200px",
			height: type === "line" ? "0px" : "200px",
			styles: { ...AdvancedStyles },
			children: [],
			frames: [],
		};
		switch (type) {
			case "rectangle":
				return { ...baseProps };
			case "circle":
				return { ...baseProps, radius: 100 };
			case "line":
				return {
					...baseProps,
					x2: x,
					y2: y,
					styles: {
						...baseProps.styles,
						stroke: "#aabbcc",
						strokeWidth: "2px",
					},
				};
			case "triangle":
				return {
					...baseProps,
					points: [
						{ x: x, y: y },
						{ x: x + 200, y: y },
						{ x: x + 100, y: y - 200 },
					],
				};
			case "text":
				return {
					...baseProps,
					width: "200px",
					height: "40px",
					text: "Double click to edit",
					styles: { ...baseProps.styles, fontSize: "16px", color: "#000000" },
				};
			case "image":
				return { ...baseProps, src: "" };
			case "html":
				return {
					...baseProps,
					html: '<input type="text" value="Input" style="width:100%;height:100%;box-sizing:border-box;" />',
					width: "200px",
					height: "40px",
				};
			case "group":
				return { ...baseProps };
			case "flex":
				return {
					...baseProps,
					styles: { ...baseProps.styles, display: "flex" },
				};
			case "grid":
				return {
					...baseProps,
					styles: { ...baseProps.styles, display: "grid" },
				};
			case "scroll":
				return {
					...baseProps,
					scrollDirection: "vertical",
					styles: { ...baseProps.styles, overflow: "auto" },
				};
			default:
				throw new Error(`Unknown shape type: ${type}`);
		}
	}

	// Updates shape dimensions during drawing
	updateShapeDimensions(shape, x, y) {
		if (shape.type === "line") {
			shape.x2 = x;
			shape.y2 = y;
		} else if (shape.type === "circle") {
			const radius = Math.max(Math.abs(x - shape.x), Math.abs(y - shape.y)) / 2;
			shape.radius = radius;
			shape.width = `${radius * 2}px`;
			shape.height = `${radius * 2}px`;
		} else if (shape.type === "triangle") {
			shape.points[1].x = x;
			shape.points[2].x = shape.x + (x - shape.x) / 2;
			shape.points[2].y = y;
			shape.width = `${x - shape.x}px`;
			shape.height = `${shape.y - y}px`;
		} else {
			shape.width = `${x - shape.x}px`;
			shape.height = `${y - shape.y}px`;
		}
	}

	// Redraws the entire canvas
	redraw() {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.fillStyle = this.settings.backgroundColor;
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.shapes.forEach((shape) => this.drawShape(shape));
		if (this.showOverlay && this.selectedShapes.length) {
			this.selectedShapes.forEach((shape) => this.drawSelection(shape));
		}
	}

	// Draws a single shape
	drawShape(shape, parentX = 0, parentY = 0) {
		if (shape.styles.display === "none") return;

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
		const x = shape.x + parentX;
		const y = shape.y + parentY;
		this.ctx.globalAlpha = parseFloat(shape.styles.opacity);
		this.ctx.translate(x + width / 2, y + height / 2);
		const rotation = this.getRotationAngle(shape);
		this.ctx.rotate((rotation * Math.PI) / 180);
		this.ctx.translate(-(x + width / 2), -(y + height / 2));

		this.applyStyles(shape.styles);

		if (!["html", "flex", "grid", "scroll"].includes(shape.type)) {
			switch (shape.type) {
				case "rectangle":
					this.ctx.fillRect(x, y, width, height);
					this.ctx.strokeRect(x, y, width, height);
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
					this.ctx.closePath();
					break;
				case "line":
					this.ctx.beginPath();
					this.ctx.moveTo(x, y);
					this.ctx.lineTo(shape.x2, shape.y2);
					this.ctx.strokeStyle = shape.styles.stroke || "#aabbcc";
					this.ctx.lineWidth = parseFloat(shape.styles.strokeWidth) || 2;
					this.ctx.stroke();
					this.ctx.closePath();
					break;
				case "triangle":
					this.ctx.beginPath();
					this.ctx.moveTo(shape.points[0].x, shape.points[0].y);
					this.ctx.lineTo(shape.points[1].x, shape.points[1].y);
					this.ctx.lineTo(shape.points[2].x, shape.points[2].y);
					this.ctx.closePath();
					this.ctx.fill();
					this.ctx.stroke();
					break;
				case "text":
					this.ctx.fillStyle = shape.styles.color;
					this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
					this.ctx.textAlign = shape.styles.textAlign;
					this.ctx.fillText(
						shape.text,
						x,
						y + parseFloat(shape.styles.fontSize)
					);
					this.ctx.strokeRect(x, y, width, height);
					break;
				case "image":
					if (shape.src) {
						const img = new Image();
						img.src = shape.src;
						img.onload = () => this.ctx.drawImage(img, x, y, width, height);
					} else {
						this.ctx.fillRect(x, y, width, height);
						this.ctx.strokeRect(x, y, width, height);
					}
					break;
				case "group":
					shape.children.forEach((child) => this.drawShape(child, x, y));
					this.ctx.strokeRect(x, y, width, height);
					break;
			}
		}
		this.ctx.restore();
	}

	// Applies styles to canvas context
	applyStyles(styles) {
		this.ctx.fillStyle = styles.backgroundColor;
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

	// Creates DOM element for HTML-based shapes
	createDomElement(shape) {
		const existing = this.htmlElements.get(shape.id);
		if (existing) existing.remove();

		const div = document.createElement("div");
		if (shape.type === "html") {
			div.innerHTML = shape.html;
		} else if (["flex", "grid", "scroll"].includes(shape.type)) {
			shape.children.forEach((child) => {
				const childDiv = document.createElement("div");
				childDiv.style.width = child.width;
				childDiv.style.height = child.height;
				childDiv.style.backgroundColor = child.styles.backgroundColor;
				this.applyDomStyles(childDiv, child.styles);
				div.appendChild(childDiv);
			});
		}
		div.style.position = shape.styles.position;
		div.style.left = `${this.canvas.offsetLeft + shape.x}px`;
		div.style.top = `${this.canvas.offsetTop + shape.y}px`;
		div.style.width = shape.width;
		div.style.height = shape.height;
		div.style.transform = shape.styles.transform;
		div.style.zIndex = shape.styles.zIndex.toString();
		div.style.overflow =
			shape.type === "scroll"
				? shape.scrollDirection === "vertical"
					? "auto"
					: "auto"
				: shape.styles.overflow;
		div.style.overflowX =
			shape.type === "scroll" && shape.scrollDirection === "horizontal"
				? "auto"
				: shape.styles.overflowX;
		div.style.overflowY =
			shape.type === "scroll" && shape.scrollDirection === "vertical"
				? "auto"
				: shape.styles.overflowY;
		this.applyDomStyles(div, shape.styles);
		document.body.appendChild(div);
		this.htmlElements.set(shape.id, div);
	}

	// Updates DOM element for HTML-based shapes
	updateDomElement(shape) {
		if (!["html", "flex", "grid", "scroll"].includes(shape.type)) return;
		const div = this.htmlElements.get(shape.id);
		if (div) {
			div.style.left = `${this.canvas.offsetLeft + shape.x}px`;
			div.style.top = `${this.canvas.offsetTop + shape.y}px`;
			div.style.width = shape.width;
			div.style.height = shape.height;
			div.style.transform = shape.styles.transform;
			div.style.overflow =
				shape.type === "scroll"
					? shape.scrollDirection === "vertical"
						? "auto"
						: "auto"
					: shape.styles.overflow;
			div.style.overflowX =
				shape.type === "scroll" && shape.scrollDirection === "horizontal"
					? "auto"
					: shape.styles.overflowX;
			div.style.overflowY =
				shape.type === "scroll" && shape.scrollDirection === "vertical"
					? "auto"
					: shape.styles.overflowY;
			this.applyDomStyles(div, shape.styles);
			if (["flex", "grid", "scroll"].includes(shape.type)) {
				while (div.firstChild) div.removeChild(div.firstChild);
				shape.children.forEach((child) => {
					const childDiv = document.createElement("div");
					childDiv.style.width = child.width;
					childDiv.style.height = child.height;
					childDiv.style.backgroundColor = child.styles.backgroundColor;
					this.applyDomStyles(childDiv, child.styles);
					div.appendChild(childDiv);
				});
			}
		}
	}

	// Applies styles to DOM elements
	applyDomStyles(element, styles) {
		Object.keys(styles).forEach((key) => {
			if (key in element.style) {
				element.style[key] = styles[key];
			}
		});
	}

	// Updates nested elements' positions
	updateNestedElements(shape) {
		if (shape.children) {
			shape.children.forEach((child) => {
				child.x += shape.x;
				child.y += shape.y;
				this.updateDomElement(child);
				this.updateNestedElements(child);
			});
		}
	}

	// Removes DOM element
	removeDomElement(id) {
		const div = this.htmlElements.get(id);
		if (div) {
			div.remove();
			this.htmlElements.delete(id);
		}
	}

	// Draws selection handles around selected shape
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
			[shape.x + width - 5, shape.y + height - 5],
			[shape.x - 5, shape.y + height - 5],
			[shape.x + width - 5, shape.y - 5],
			[shape.x - 5, shape.y - 5],
			[shape.x + width / 2 - 5, shape.y - 5],
			[shape.x + width / 2 - 5, shape.y + height - 5],
			[shape.x + width - 5, shape.y + height / 2 - 5],
			[shape.x - 5, shape.y + height / 2 - 5],
		];
		this.ctx.fillStyle = "#ffffff";
		this.ctx.strokeStyle = "#000000";
		handles.forEach(([hx, hy]) => {
			this.ctx.fillRect(hx, hy, 10, 10);
			this.ctx.strokeRect(hx, hy, 10, 10);
		});

		this.ctx.beginPath();
		this.ctx.arc(shape.x + width / 2, shape.y - 20, 5, 0, Math.PI * 2);
		this.ctx.fill();
		this.ctx.stroke();
		this.ctx.closePath();

		this.ctx.restore();
	}

	/**
	 * Sets whether to show selection overlay
	 * @param show - Whether to show the overlay
	 */
	setOverlay(show) {
		this.showOverlay = show;
		this.redraw();
	}

	/**
	 * Starts drawing a new shape
	 * @param type - The type of shape to draw
	 */
	startDrawing(type) {
		this.currentShape = type;
	}

	/**
	 * Deletes selected shapes
	 */
	deleteSelected() {
		if (this.selectedShapes.length) {
			this.selectedShapes.forEach((shape) => {
				this.shapes = this.shapes.filter((s) => s.id !== shape.id);
				this.removeDomElement(shape.id);
			});
			this.selectedShapes = [];
			this.state.addState([...this.shapes]);
			this.redraw();
		}
	}

	/**
	 * Clears all shapes from the canvas
	 */
	clearCanvas() {
		this.shapes.forEach((shape) => this.removeDomElement(shape.id));
		this.shapes = [];
		this.selectedShapes = [];
		this.animationFrames.clear();
		this.currentFrameIndex.clear();
		this.pausedAnimations.clear();
		this.state.addState([]);
		this.redraw();
		if (this.timelineCanvas) {
			this.timelineCanvas.remove();
			this.timelineCanvas = null;
			this.timelineCtx = null;
		}
	}

	/**
	 * Nests one shape inside another
	 * @param parentId - ID of parent shape
	 * @param childId - ID of child shape
	 */
	nestElement(parentId, childId) {
		const parent = this.shapes.find((s) => s.id === parentId);
		const child = this.shapes.find((s) => s.id === childId);
		if (parent && child && parent !== child) {
			this.shapes = this.shapes.filter((s) => s.id !== childId);
			parent.children.push(child);
			child.x -= parent.x;
			child.y -= parent.y;
			this.state.addState([...this.shapes]);
			this.updateDomElement(parent);
			this.redraw();
		}
	}

	/**
	 * Groups multiple elements into a single group
	 * @param elementIds - Array of element IDs to group
	 */
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

		this.shapes.push(group);
		this.state.addState([...this.shapes]);
		this.redraw();
	}

	/**
	 * Undoes the last action
	 */
	undo() {
		this.shapes.forEach((shape) => this.removeDomElement(shape.id));
		this.shapes = this.state.undo() || [];
		this.selectedShapes = [];
		this.shapes.forEach((shape) => {
			if (["html", "flex", "grid", "scroll"].includes(shape.type))
				this.createDomElement(shape);
		});
		this.redraw();
	}

	/**
	 * Redoes the last undone action
	 */
	redo() {
		this.shapes.forEach((shape) => this.removeDomElement(shape.id));
		this.shapes = this.state.redo() || [];
		this.selectedShapes = [];
		this.shapes.forEach((shape) => {
			if (["html", "flex", "grid", "scroll"].includes(shape.type))
				this.createDomElement(shape);
		});
		this.redraw();
	}

	/**
	 * Animates a shape from the beginning using stored frames
	 * @param id - The ID of the shape to animate
	 */
	animateElement(id) {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || shape.frames.length === 0) return;

		this.stopAnimation(id);
		this.currentFrameIndex.set(id, 0);
		this.playAnimation(id);
	}

	/**
	 * Stops animation for a specific shape
	 * @param id - The ID of the shape to stop animating
	 */
	stopAnimation(id) {
		const frameId = this.animationFrames.get(id);
		if (frameId) {
			cancelAnimationFrame(frameId);
			this.animationFrames.delete(id);
			this.pausedAnimations.delete(id);
		}
	}

	/**
	 * Updates a shape's property
	 * @param id - The ID of the shape
	 * @param property - The property to update
	 * @param value - The new value
	 */
	updateShapeProperty(id, property, value) {
		const shape = this.getElementById(id);
		if (shape) {
			if (property === "frames") {
				shape.frames = value;
			} else {
				shape.styles[property] = value;
			}
			this.state.addState([...this.shapes]);
			this.updateDomElement(shape);
			this.redraw();
			this.updateTimeline();
		}
	}

	// Finds a nested shape by ID
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

	/**
	 * Updates canvas settings
	 * @param settings - New settings to apply
	 */
	updateSettings(settings) {
		Object.assign(this.settings, settings);
		this.canvas.width = this.settings.width;
		this.canvas.height = this.settings.height;
		this.shapes.forEach((shape) => this.restrictWithinBounds(shape));
		this.shapes.forEach((shape) => this.updateDomElement(shape));
		this.redraw();
	}

	/**
	 * Gets all elements as JSON
	 * @returns Array of shapes
	 */
	getElementsAsJson() {
		const cloneShapes = (shapes) => {
			return shapes.map((shape) => {
				const clonedShape = { ...shape };
				if (shape.children && shape.children.length > 0) {
					clonedShape.children = cloneShapes(shape.children);
				}
				return clonedShape;
			});
		};
		return cloneShapes(this.shapes);
	}

	/**
	 * Loads elements from JSON data
	 * @param jsonData - JSON string or object containing shape data
	 */
	loadElementsFromJson(jsonData) {
		let shapes = [];

		if (typeof jsonData === "string") {
			try {
				shapes = JSON.parse(jsonData);
			} catch (e) {
				throw new Error("Invalid JSON string provided");
			}
		} else {
			shapes = jsonData;
		}

		if (!Array.isArray(shapes)) {
			throw new Error("Input must be an array of shapes");
		}

		const requiredProps = [
			"id",
			"type",
			"x",
			"y",
			"width",
			"height",
			"styles",
			"children",
		];
		const validTypes = [
			"rectangle",
			"circle",
			"line",
			"triangle",
			"text",
			"image",
			"html",
			"group",
			"flex",
			"grid",
			"scroll",
		];

		const validateShape = (shape, level = 0) => {
			for (const prop of requiredProps) {
				if (!(prop in shape)) {
					throw new Error(
						`Shape at level ${level} is missing required property: ${prop}`
					);
				}
			}
			if (!validTypes.includes(shape.type)) {
				throw new Error(
					`Shape at level ${level} has invalid type: ${shape.type}`
				);
			}
			if (
				typeof shape.x !== "number" ||
				typeof shape.y !== "number" ||
				typeof shape.width !== "string" ||
				typeof shape.height !== "string"
			) {
				throw new Error(`Shape at level ${level} has invalid properties`);
			}
			if (typeof shape.styles !== "object" || shape.styles === null) {
				throw new Error(`Shape at level ${level} has invalid styles`);
			}
			if (!Array.isArray(shape.children)) {
				throw new Error(`Shape at level ${level} has invalid children array`);
			}
			shape.children.forEach((child, index) => validateShape(child, level + 1));
		};

		try {
			shapes.forEach((shape, index) => validateShape(shape, index));
		} catch (e) {
			throw new Error(`Validation failed: ${e.message}`);
		}

		this.shapes.forEach((shape) => this.removeDomElement(shape.id));
		this.shapes = [];
		this.htmlElements.clear();

		const cloneShapes = (shapesToClone) => {
			return shapesToClone.map((shape) => {
				const clonedShape = {
					...shape,
					styles: { ...shape.styles },
					frames: shape.frames ? [...shape.frames] : [],
				};
				if (shape.children && shape.children.length > 0) {
					clonedShape.children = cloneShapes(shape.children);
				}
				return clonedShape;
			});
		};

		this.shapes = cloneShapes(shapes);
		this.shapes.forEach((shape) => {
			if (["html", "flex", "grid", "scroll"].includes(shape.type)) {
				this.createDomElement(shape);
			}
		});

		this.state.addState([...this.shapes]);
		this.redraw();
	}
}

// State management class
class StateManager {
	constructor(key) {
		this.key = key;
		this.history = [];
		this.currentIndex = -1;
		this.batchSize = 100;
	}

	// Adds a new state to history
	addState(state) {
		if (this.currentIndex < this.history.length - 1) {
			this.history = this.history.slice(0, this.currentIndex + 1);
		}
		this.history.push(this.cloneState(state));
		this.currentIndex++;
		if (this.history.length > this.batchSize) {
			this.history.shift();
			this.currentIndex--;
		}
		localStorage.setItem(this.key, JSON.stringify(this.history));
	}

	// Undoes the last action
	undo() {
		if (this.currentIndex > 0) {
			this.currentIndex--;
			return this.cloneState(this.history[this.currentIndex]);
		}
		return null;
	}

	// Redoes the last undone action
	redo() {
		if (this.currentIndex < this.history.length - 1) {
			this.currentIndex++;
			return this.cloneState(this.history[this.currentIndex]);
		}
		return null;
	}

	// Loads state from storage
	load() {
		const saved = localStorage.getItem(this.key);
		if (saved) {
			this.history = JSON.parse(saved);
			this.currentIndex = this.history.length - 1;
			return this.cloneState(this.history[this.currentIndex]);
		}
		return null;
	}

	// Clears state from storage
	clear() {
		localStorage.removeItem(this.key);
	}

	// Clones a state to prevent reference issues
	cloneState(state) {
		return state.map((shape) => {
			const newShape = { ...shape };
			if (newShape.children) {
				newShape.children = this.cloneState(newShape.children);
			}
			if (newShape.styles) {
				newShape.styles = { ...newShape.styles };
			}
			if (newShape.frames) {
				newShape.frames = [...newShape.frames];
			}
			return newShape;
		});
	}
}
