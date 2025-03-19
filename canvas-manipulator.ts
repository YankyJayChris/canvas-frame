// Interface defining advanced CSS-like styles for shapes
interface AdvancedStyles {
    display: string;
    position: string;
    top: number | string;
    right: number | string;
    bottom: number | string;
    left: number | string;
    float: string;
    clear: string;
    zIndex: number;
    width: string;
    height: string;
    maxWidth: string;
    maxHeight: string;
    minWidth: string;
    minHeight: string;
    boxSizing: string;
    margin: number | string;
    marginTop: number | string;
    marginRight: number | string;
    marginBottom: number | string;
    marginLeft: number | string;
    padding: number | string;
    paddingTop: number | string;
    paddingRight: number | string;
    paddingBottom: number | string;
    paddingLeft: number | string;
    border: string;
    borderWidth: string;
    borderStyle: string;
    borderColor: string;
    borderRadius: number | string;
    backgroundColor: string;
    backgroundImage: string;
    backgroundSize: string;
    backgroundPosition: string;
    backgroundRepeat: string;
    color: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    fontStyle: string;
    lineHeight: string;
    letterSpacing: string;
    textAlign: string;
    opacity: number | string;
    boxShadow: string;
    transform: string;
    flexDirection: string;
    flexWrap: string;
    justifyContent: string;
    alignItems: string;
    gridTemplateColumns: string;
    gridTemplateRows: string;
    gap: string;
    overflow: string;
    overflowX: string;
    overflowY: string;
    stroke?: string;
    strokeWidth?: string;
}

// Default styles applied to new shapes
const AdvancedStyles: AdvancedStyles = {
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

// Interface defining a shape on the canvas
interface Shape {
    id: string;
    type: string;
    x: number;
    y: number;
    width: string; // Changed to string for responsive units
    height: string; // Changed to string for responsive units
    styles: AdvancedStyles;
    children: Shape[];
    radius?: number;
    x2?: number;
    y2?: number;
    points?: { x: number; y: number }[];
    text?: string;
    src?: string;
    html?: string;
    scrollDirection?: string;
    frames?: { x: number; y: number; rotation: number; duration: number }[];
}

// Interface for canvas settings
interface CanvasSettings {
    width?: number;
    height?: number;
    backgroundColor?: string;
    showOverlay?: boolean;
    disableZoom?: boolean;
    [key: string]: any;
}

// Main class for manipulating the canvas
class CanvasManipulator {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private state: StateManager;
	private isDrawing: boolean = false;
	private isDragging: boolean = false;
	private isResizing: boolean = false;
	private isRotating: boolean = false;
	private currentShape: string | null = null;
	private selectedShapes: Shape[] = [];
	private shapes: Shape[] = [];
	private startX: number = 0;
	private startY: number = 0;
	private resizeHandle: string | null = null;
	private htmlElements: Map<string, HTMLElement> = new Map();
	private showOverlay: boolean;
	private disableZoom: boolean;
	private settings: CanvasSettings;
	private isExternalCanvas: boolean;
	private animationFrames: Map<string, number> = new Map();
	private currentFrameIndex: Map<string, number> = new Map(); // Tracks current frame index per shape
	private timelineCanvas: HTMLCanvasElement | null = null; // Timeline canvas
	private timelineCtx: CanvasRenderingContext2D | null = null;
	private timelineDragging: boolean = false; // Flag for timeline dragging
	private selectedKeyframeIndex: number | null = null; // Selected keyframe in timeline
	private pausedAnimations: Set<string> = new Set(); // Tracks paused animations

	constructor(
		canvasIdOrElement: string | HTMLCanvasElement,
		settings: CanvasSettings = {}
	) {
		this.isExternalCanvas = typeof canvasIdOrElement !== "string";
		this.canvas = this.isExternalCanvas
			? (canvasIdOrElement as HTMLCanvasElement)
			: (document.getElementById(
					canvasIdOrElement as string
			  ) as HTMLCanvasElement) || this.createCanvas();
		this.ctx = this.canvas.getContext("2d")!;
		this.state = new StateManager("canvasState");
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
		this.canvas.width = this.settings.width || 800;
		this.canvas.height = this.settings.height || 600;
		this.canvas.tabIndex = 0;

		this.initEventListeners();
		this.shapes = this.state.load() || [];
		this.shapes.forEach((shape) => {
			if (["html", "flex", "grid", "scroll"].includes(shape.type))
				this.createDomElement(shape);
		});
		this.redraw();
		window.addEventListener("beforeunload", () => this.state.clear());
	}

	private createCanvas(): HTMLCanvasElement {
		const canvas = document.createElement("canvas");
		document.body.appendChild(canvas);
		return canvas;
	}

	// Calculates pixel value from string (handles %, vh, vw, px)
	private calculateDimension(
		value: string,
		parentDimension: number,
		viewportDimension: number
	): number {
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
	public getCanvas(): HTMLCanvasElement {
		return this.canvas;
	}

	/**
	 * Gets a shape by its ID, including nested shapes
	 * @param id - The ID of the shape to find
	 * @returns The shape if found, null otherwise
	 */
	public getElementById(id: string): Shape | null {
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
	public exportCanvas(format: "png" | "jpg", quality: number = 0.92): string {
		return this.canvas.toDataURL(`image/${format}`, quality);
	}

	/**
	 * Plays the animation for a shape from the current frame
	 * @param id - The ID of the shape to animate
	 */
	public playAnimation(id: string): void {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || shape.frames.length === 0) return;

		this.stopAnimation(id); // Stop any existing animation
		this.pausedAnimations.delete(id);
		let frameIndex = this.currentFrameIndex.get(id) || 0;

		const animate = (timestamp: number) => {
			if (this.pausedAnimations.has(id) || frameIndex >= shape.frames!.length) {
				this.animationFrames.delete(id);
				return;
			}

			const frame = shape.frames![frameIndex];
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
	public pauseAnimation(id: string): void {
		if (this.animationFrames.has(id)) {
			this.pausedAnimations.add(id);
		}
	}

	/**
	 * Gets the current keyframe for a shape
	 * @param id - The ID of the shape
	 * @returns The current keyframe or null if none
	 */
	public getCurrentKeyframe(
		id: string
	): { x: number; y: number; rotation: number; duration: number } | null {
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
	public getTotalAnimationDuration(id: string): number {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || shape.frames.length === 0) return 0;
		return shape.frames.reduce((sum, frame) => sum + frame.duration, 0);
	}

	/**
	 * Sets keyframes per second for a shape's animation
	 * @param id - The ID of the shape
	 * @param fps - Frames per second to set
	 */
	public setKeyframesPerSecond(id: string, fps: number): void {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || shape.frames.length === 0 || fps <= 0)
			return;

		const frameDuration = 1000 / fps; // Convert FPS to milliseconds per frame
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
	public createKeyframeTimeline(
		shapeId: string,
		width: number = 400,
		height: number = 50
	): HTMLCanvasElement {
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
		document.body.appendChild(this.timelineCanvas);
		this.timelineCtx = this.timelineCanvas.getContext("2d")!;

		this.updateTimeline(shapeId);

		// Add interactivity
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
	private updateTimeline(
		shapeId: string = this.selectedShapes[0]?.id || ""
	): void {
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

		const totalDuration = shape.frames.reduce(
			(sum, frame) => sum + frame.duration,
			0
		);
		const frameWidth = this.timelineCanvas.width / shape.frames.length;

		// Draw keyframes
		shape.frames.forEach((frame, index) => {
			const x = index * frameWidth;
			this.timelineCtx!.fillStyle =
				index === this.currentFrameIndex.get(shapeId) ? "#ff0000" : "#0000ff";
			this.timelineCtx!.fillRect(x, 10, 5, this.timelineCanvas!.height - 20);
		});

		// Draw playhead
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
	private handleTimelineMouseDown(e: MouseEvent, shapeId: string): void {
		const rect = this.timelineCanvas!.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const frameWidth =
			this.timelineCanvas!.width /
			(this.getElementById(shapeId)!.frames!.length || 1);
		const frameIndex = Math.floor(x / frameWidth);

		this.selectedKeyframeIndex = frameIndex;
		this.currentFrameIndex.set(shapeId, frameIndex);
		this.timelineDragging = true;
		this.updateTimeline(shapeId);
	}

	// Handles timeline mousemove for dragging playhead
	private handleTimelineMouseMove(e: MouseEvent, shapeId: string): void {
		if (!this.timelineDragging || !this.timelineCanvas) return;

		const rect = this.timelineCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const frameWidth =
			this.timelineCanvas.width /
			(this.getElementById(shapeId)!.frames!.length || 1);
		const frameIndex = Math.max(
			0,
			Math.min(
				Math.floor(x / frameWidth),
				this.getElementById(shapeId)!.frames!.length - 1
			)
		);

		this.currentFrameIndex.set(shapeId, frameIndex);
		const shape = this.getElementById(shapeId)!;
		const frame = shape.frames![frameIndex];
		shape.x = frame.x;
		shape.y = frame.y;
		shape.styles.transform = `rotate(${frame.rotation}deg)`;
		this.updateDomElement(shape);
		this.redraw();
		this.updateTimeline(shapeId);
	}

	// Handles timeline mouseup to end dragging
	private handleTimelineMouseUp(): void {
		this.timelineDragging = false;
	}

	/**
	 * Edits the selected keyframe of a shape
	 * @param shapeId - The ID of the shape
	 * @param newFrame - New frame data (x, y, rotation, duration)
	 */
	public editSelectedKeyframe(
		shapeId: string,
		newFrame: { x?: number; y?: number; rotation?: number; duration?: number }
	): void {
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
	private initEventListeners(): void {
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
	private handleKeyDown(e: KeyboardEvent): void {
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
	private handleMouseDown(e: MouseEvent): void {
		const { x, y } = this.getMousePos(e);
		this.startX = x;
		this.startY = y;

		const shape: Shape | null = this.findShapeAtPoint(x, y);
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
	private handleMouseMove(e: MouseEvent): void {
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
			this.resizeShape(shape, x, y, this.resizeHandle!);
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
				this.updateNestedElements(shape); // Ensure children move with parent
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
	private handleMouseUp(): void {
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
	private handleZoom(e: WheelEvent): void {
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
	private handleDragOver(e: DragEvent): void {
		e.preventDefault();
		e.dataTransfer!.dropEffect = "copy";
	}

	// Handles drop events for drag-and-drop
	private handleDrop(e: DragEvent): void {
		e.preventDefault();
		const { x, y } = this.getMousePos(e);
		const type = e.dataTransfer!.getData("type");
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
	private getMousePos(e: MouseEvent | DragEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
			y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
		};
	}

	// Finds shape at a specific point
	private findShapeAtPoint(x: number, y: number): Shape | null {
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
	private findNestedShapeAtPoint(
		x: number,
		y: number,
		children: Shape[]
	): Shape | null {
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
	private isPointInShape(x: number, y: number, shape: Shape): boolean {
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
	private rotatePoint(
		x: number,
		y: number,
		cx: number,
		cy: number,
		angle: number
	): { x: number; y: number } {
		const radians = (angle * Math.PI) / 180;
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		const nx = cos * (x - cx) + sin * (y - cy) + cx;
		const ny = cos * (y - cy) - sin * (x - cx) + cy;
		return { x: nx, y: ny };
	}

	// Gets rotation angle from transform style
	private getRotationAngle(shape: Shape): number {
		const transform = shape.styles.transform || "rotate(0deg)";
		const match = transform.match(/rotate\(([^)]+)\)/);
		return match ? parseFloat(match[1]) : 0;
	}

	// Gets resize handle at a point
	private getResizeHandle(x: number, y: number, shape: Shape): string | null {
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
			{
				pos: "rotate",
				x: shape.x + width / 2 - 5,
				y: shape.y - 25,
				size: 10,
			},
		];
		return (
			handles.find(
				(h) => x >= h.x && x <= h.x + h.size && y >= h.y && y <= h.y + h.size
			)?.pos || null
		);
	}

	// Resizes a shape based on handle
	private resizeShape(
		shape: Shape,
		x: number,
		y: number,
		handle: string
	): void {
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
	private restrictWithinBounds(shape: Shape): void {
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
	private createShape(type: string, x: number, y: number): Shape {
		const id = Date.now().toString();
		const baseProps: Shape = {
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
					styles: {
						...baseProps.styles,
						fontSize: "16px",
						color: "#000000",
					},
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
	private updateShapeDimensions(shape: Shape, x: number, y: number): void {
		if (shape.type === "line") {
			shape.x2 = x;
			shape.y2 = y;
		} else if (shape.type === "circle") {
			const radius = Math.max(Math.abs(x - shape.x), Math.abs(y - shape.y)) / 2;
			shape.radius = radius;
			shape.width = `${radius * 2}px`;
			shape.height = `${radius * 2}px`;
		} else if (shape.type === "triangle") {
			shape.points![1].x = x;
			shape.points![2].x = shape.x + (x - shape.x) / 2;
			shape.points![2].y = y;
			shape.width = `${x - shape.x}px`;
			shape.height = `${shape.y - y}px`;
		} else {
			shape.width = `${x - shape.x}px`;
			shape.height = `${y - shape.y}px`;
		}
	}

	// Redraws the entire canvas
	public redraw(): void {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.fillStyle = this.settings.backgroundColor!;
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.shapes.forEach((shape) => {
			this.drawShape(shape);
			this.updateDomElement(shape); // Ensure DOM elements are updated during redraw
		});
		if (this.showOverlay && this.selectedShapes.length) {
			this.selectedShapes.forEach((shape) => this.drawSelection(shape));
		}
	}

	// Draws a single shape
	private drawShape(
		shape: Shape,
		parentX: number = 0,
		parentY: number = 0
	): void {
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
		this.ctx.globalAlpha = parseFloat(shape.styles.opacity as string);
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
						x + shape.radius!,
						y + shape.radius!,
						shape.radius!,
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
					this.ctx.lineTo(shape.x2!, shape.y2!);
					this.ctx.strokeStyle = shape.styles.stroke || "#aabbcc";
					this.ctx.lineWidth =
						parseFloat(shape.styles.strokeWidth as string) || 2;
					this.ctx.stroke();
					this.ctx.closePath();
					break;
				case "triangle":
					this.ctx.beginPath();
					this.ctx.moveTo(shape.points![0].x, shape.points![0].y);
					this.ctx.lineTo(shape.points![1].x, shape.points![1].y);
					this.ctx.lineTo(shape.points![2].x, shape.points![2].y);
					this.ctx.closePath();
					this.ctx.fill();
					this.ctx.stroke();
					break;
				case "text":
					this.ctx.fillStyle = shape.styles.color;
					this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
					this.ctx.textAlign = shape.styles.textAlign as CanvasTextAlign;
					this.ctx.fillText(
						shape.text!,
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
	private applyStyles(styles: AdvancedStyles): void {
		this.ctx.fillStyle = styles.backgroundColor;
		this.ctx.strokeStyle =
			styles.borderColor || styles.border.split(" ")[2] || "#000";
		this.ctx.lineWidth =
			parseFloat(
				(styles.borderWidth as string) || styles.border.split(" ")[0]
			) || 1;
		this.ctx.shadowBlur = parseFloat(styles.boxShadow.split(" ")[2]) || 0;
		this.ctx.shadowColor =
			styles.boxShadow.split(" ").slice(3).join(" ") || "rgba(0,0,0,0.2)";
		this.ctx.shadowOffsetX = parseFloat(styles.boxShadow.split(" ")[0]) || 0;
		this.ctx.shadowOffsetY = parseFloat(styles.boxShadow.split(" ")[1]) || 0;
	}

	// Creates DOM element for HTML-based shapes, ensuring it stays within canvas
	private createDomElement(shape: Shape): void {
		const existing = this.htmlElements.get(shape.id);
		if (existing) existing.remove();

		const div = document.createElement("div");
		if (shape.type === "html") {
			div.innerHTML = shape.html!;
		} else if (["flex", "grid", "scroll"].includes(shape.type)) {
			shape.children.forEach((child) => {
				const childDiv = document.createElement("div");
				childDiv.style.width = child.width;
				childDiv.style.height = child.height;
				childDiv.style.backgroundColor = child.styles.backgroundColor;
				childDiv.style.position = "absolute"; // Position children relative to parent
				childDiv.style.left = `${child.x}px`;
				childDiv.style.top = `${child.y}px`;
				this.applyDomStyles(childDiv, child.styles);
				div.appendChild(childDiv);
			});
		}

		// Position relative to canvas
		div.style.position = "absolute";
		div.style.left = `${this.canvas.offsetLeft + shape.x}px`;
		div.style.top = `${this.canvas.offsetTop + shape.y}px`;
		div.style.width = shape.width;
		div.style.height = shape.height;
		div.style.transform = shape.styles.transform;
		div.style.zIndex = shape.styles.zIndex.toString();
		div.style.overflow = "hidden"; // Hide overflow by default
		this.applyDomStyles(div, shape.styles);

		// Ensure it stays within canvas bounds
		this.restrictDomElementWithinCanvas(div);
		document.body.appendChild(div);
		this.htmlElements.set(shape.id, div);
	}

	// Updates DOM element for HTML-based shapes, keeping it within canvas
	private updateDomElement(shape: Shape): void {
		if (!["html", "flex", "grid", "scroll"].includes(shape.type)) return;
		const div = this.htmlElements.get(shape.id);
		if (div) {
			div.style.left = `${this.canvas.offsetLeft + shape.x}px`;
			div.style.top = `${this.canvas.offsetTop + shape.y}px`;
			div.style.width = shape.width;
			div.style.height = shape.height;
			div.style.transform = shape.styles.transform;
			div.style.overflow = "hidden"; // Hide overflow
			this.applyDomStyles(div, shape.styles);

			// Update child positions relative to parent
			if (["flex", "grid", "scroll"].includes(shape.type)) {
				while (div.firstChild) div.removeChild(div.firstChild);
				shape.children.forEach((child) => {
					const childDiv = document.createElement("div");
					childDiv.style.width = child.width;
					childDiv.style.height = child.height;
					childDiv.style.backgroundColor = child.styles.backgroundColor;
					childDiv.style.position = "absolute";
					childDiv.style.left = `${child.x}px`;
					childDiv.style.top = `${child.y}px`;
					this.applyDomStyles(childDiv, child.styles);
					div.appendChild(childDiv);
				});
			}

			// Restrict within canvas bounds
			this.restrictDomElementWithinCanvas(div);
		}
	}

	// Restrict DOM element within canvas bounds
	private restrictDomElementWithinCanvas(element: HTMLElement): void {
		const canvasRect = this.canvas.getBoundingClientRect();
		const elementRect = element.getBoundingClientRect();

		let left = parseFloat(element.style.left);
		let top = parseFloat(element.style.top);
		const width = parseFloat(element.style.width);
		const height = parseFloat(element.style.height);

		// Restrict left and top to stay within canvas
		left = Math.max(canvasRect.left, Math.min(left, canvasRect.right - width));
		top = Math.max(canvasRect.top, Math.min(top, canvasRect.bottom - height));

		element.style.left = `${left}px`;
		element.style.top = `${top}px`;
	}

	// Updates nested elements' positions and ensures they stay within parent
	private updateNestedElements(shape: Shape): void {
		if (shape.children) {
			const parentWidth = this.calculateDimension(
				shape.width,
				this.canvas.width,
				this.canvas.height
			);
			const parentHeight = this.calculateDimension(
				shape.height,
				this.canvas.height,
				this.canvas.height
			);

			shape.children.forEach((child) => {
				// Adjust child position to stay within parent's bounds
				child.x = Math.max(
					0,
					Math.min(
						child.x,
						parentWidth -
							this.calculateDimension(child.width, parentWidth, parentHeight)
					)
				);
				child.y = Math.max(
					0,
					Math.min(
						child.y,
						parentHeight -
							this.calculateDimension(child.height, parentHeight, parentHeight)
					)
				);
				this.updateDomElement(child);
				this.updateNestedElements(child);
			});
		}
	}

	// Applies styles to DOM elements
	private applyDomStyles(element: HTMLElement, styles: AdvancedStyles): void {
		Object.keys(styles).forEach((key) => {
			if (key in element.style) {
				(element.style as any)[key] = styles[key as keyof AdvancedStyles];
			}
		});
	}

	// Removes DOM element
	private removeDomElement(id: string): void {
		const div = this.htmlElements.get(id);
		if (div) {
			div.remove();
			this.htmlElements.delete(id);
		}
	}

	// Draws selection handles around selected shape
	private drawSelection(shape: Shape): void {
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
	public setOverlay(show: boolean): void {
		this.showOverlay = show;
		this.redraw();
	}

	/**
	 * Starts drawing a new shape
	 * @param type - The type of shape to draw
	 */
	public startDrawing(type: string): void {
		this.currentShape = type;
	}

	/**
	 * Deletes selected shapes
	 */
	public deleteSelected(): void {
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
	public clearCanvas(): void {
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
	 * Nests one shape inside another, ensuring proper positioning
	 */
	public nestElement(parentId: string, childId: string): void {
		const parent = this.shapes.find((s) => s.id === parentId);
		const child = this.shapes.find((s) => s.id === childId);
		if (parent && child && parent !== child) {
			this.shapes = this.shapes.filter((s) => s.id !== childId);
			// Adjust child position to be relative to parent
			child.x = child.x - parent.x;
			child.y = child.y - parent.y;
			parent.children.push(child);
			this.state.addState([...this.shapes]);
			this.updateDomElement(parent);
			this.redraw();
		}
	}

	/**
	 * Groups multiple elements into a single group
	 * @param elementIds - Array of element IDs to group
	 */
	public groupElements(elementIds: string[]): void {
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
	public undo(): void {
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
	public redo(): void {
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
	public animateElement(id: string): void {
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
	public stopAnimation(id: string): void {
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
	public updateShapeProperty(id: string, property: string, value: any): void {
		const shape = this.getElementById(id);
		if (shape) {
			if (property === "frames") {
				shape.frames = value;
			} else {
				(shape.styles as any)[property] = value;
			}
			this.state.addState([...this.shapes]);
			this.updateDomElement(shape);
			this.redraw();
			this.updateTimeline();
		}
	}

	// Finds a nested shape by ID
	private findNestedShape(id: string, shapes: Shape[]): Shape | null {
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
	public updateSettings(settings: CanvasSettings): void {
		Object.assign(this.settings, settings);
		this.canvas.width = this.settings.width!;
		this.canvas.height = this.settings.height!;
		this.shapes.forEach((shape) => this.restrictWithinBounds(shape));
		this.shapes.forEach((shape) => this.updateDomElement(shape));
		this.redraw();
	}

	/**
	 * Gets all elements as JSON
	 * @returns Array of shapes
	 */
	public getElementsAsJson(): Shape[] {
		const cloneShapes = (shapes: Shape[]): Shape[] => {
			return shapes.map((shape) => {
				const clonedShape: Shape = { ...shape };
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
	public loadElementsFromJson(jsonData: any): void {
		let shapes: Shape[] = [];

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

		const validateShape = (shape: any, level: number = 0) => {
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
			shape.children.forEach((child: any, index: number) =>
				validateShape(child, level + 1)
			);
		};

		try {
			shapes.forEach((shape, index) => validateShape(shape, index));
		} catch (e: any) {
			throw new Error(`Validation failed: ${e.message}`);
		}

		this.shapes.forEach((shape) => this.removeDomElement(shape.id));
		this.shapes = [];
		this.htmlElements.clear();

		const cloneShapes = (shapesToClone: Shape[]): Shape[] => {
			return shapesToClone.map((shape) => {
				const clonedShape: Shape = {
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

	/**
	 * Adds a new shape to the canvas
	 * @param shape - The shape to add
	 */
	public addShape(shape: Shape): void {
		this.shapes.push(shape);
		this.state.addState([...this.shapes]);
		this.redraw();
	}

	/**
	 * Centers all children within a parent shape
	 * @param parentId - The ID of the parent shape
	 */
	public centerChildrenInParent(parentId: string): void {
		const parent = this.getElementById(parentId);
		if (!parent || !parent.children.length) return;

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

			// Center the child within the parent
			child.x = (parentWidth - childWidth) / 2;
			child.y = (parentHeight - childHeight) / 2;

			this.updateDomElement(child);
		});

		this.state.addState([...this.shapes]);
		this.redraw();
	}
}

class StateManager {
    private key: string;
    private history: Shape[][] = [];
    private currentIndex: number = -1;
    private batchSize: number = 100;

    constructor(key: string) {
        this.key = key;
    }

    // Adds a new state to history
    public addState(state: Shape[]): void {
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
    public undo(): Shape[] | null {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            return this.cloneState(this.history[this.currentIndex]);
        }
        return null;
    }

    // Redoes the last undone action
    public redo(): Shape[] | null {
        if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            return this.cloneState(this.history[this.currentIndex]);
        }
        return null;
    }

    // Loads state from storage
    public load(): Shape[] | null {
        const saved = localStorage.getItem(this.key);
        if (saved) {
            this.history = JSON.parse(saved);
            this.currentIndex = this.history.length - 1;
            return this.cloneState(this.history[this.currentIndex]);
        }
        return null;
    }

    // Clears state from storage
    public clear(): void {
        localStorage.removeItem(this.key);
    }

    // Clones a state to prevent reference issues
    private cloneState(state: Shape[]): Shape[] {
        return state.map((shape) => {
            const newShape: Shape = { ...shape };
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

export default CanvasManipulator;