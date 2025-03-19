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
	stroke: "#000",
	strokeWidth: "2px",
};

// State management class
class StateManager {
	constructor(key) {
		this.key = key;
		this.history = [];
		this.currentIndex = -1;
		this.batchSize = 100;
	}

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

	undo() {
		if (this.currentIndex > 0) {
			this.currentIndex--;
			return this.cloneState(this.history[this.currentIndex]);
		}
		return null;
	}

	redo() {
		if (this.currentIndex < this.history.length - 1) {
			this.currentIndex++;
			return this.cloneState(this.history[this.currentIndex]);
		}
		return null;
	}

	load() {
		const saved = localStorage.getItem(this.key);
		if (saved) {
			this.history = JSON.parse(saved);
			this.currentIndex = this.history.length - 1;
			return this.cloneState(this.history[this.currentIndex]);
		}
		return null;
	}

	clear() {
		localStorage.removeItem(this.key);
	}

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

class CanvasManipulator {
	constructor(canvasIdOrElement, settings = {}) {
		this.canvas =
			typeof canvasIdOrElement === "string"
				? document.getElementById(canvasIdOrElement) || this.createCanvas()
				: canvasIdOrElement;
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
		this.pausedAnimations = new Set();
		this.scrollOffsets = new Map(); // Track scroll positions for scroll elements

		// Initialize canvas
		this.canvas.width = this.settings.width;
		this.canvas.height = this.settings.height;
		this.canvas.tabIndex = 0;

		// Load initial state
		const savedState = this.state.load();
		if (savedState) {
			this.shapes = savedState;
		}

		this.initEventListeners();
		this.redraw();
		window.addEventListener("beforeunload", () => this.state.clear());
	}

	createCanvas() {
		const canvas = document.createElement("canvas");
		document.body.appendChild(canvas);
		return canvas;
	}

	calculateDimension(value, parentDimension, viewportDimension) {
		if (value === "auto") return parentDimension;
		if (value.endsWith("%")) return (parseFloat(value) / 100) * parentDimension;
		if (value.endsWith("vh"))
			return (parseFloat(value) / 100) * viewportDimension;
		if (value.endsWith("vw"))
			return (parseFloat(value) / 100) * window.innerWidth;
		return parseFloat(value) || 0;
	}

	getCanvas() {
		return this.canvas;
	}

	getElementById(id) {
		return (
			this.shapes.find((s) => s.id === id) ||
			this.findNestedShape(id, this.shapes)
		);
	}

	exportCanvas(format = "png", quality = 0.92) {
		return this.canvas.toDataURL(`image/${format}`, quality);
	}

	redraw() {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.fillStyle = this.settings.backgroundColor;
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		this.shapes.forEach((shape) => {
			this.drawShape(shape);
		});

		if (this.showOverlay && this.selectedShapes.length) {
			this.selectedShapes.forEach((shape) => this.drawSelection(shape));
		}
	}

	clearCanvas() {
		this.shapes = [];
		this.selectedShapes = [];
		this.animationFrames.clear();
		this.currentFrameIndex.clear();
		this.pausedAnimations.clear();
		this.scrollOffsets.clear();
		this.state.addState([]);
		this.redraw();
	}

	startDrawing(type) {
		this.currentShape = type;
	}

	deleteSelected() {
		if (this.selectedShapes.length) {
			this.selectedShapes.forEach((shape) => {
				this.shapes = this.shapes.filter((s) => s.id !== shape.id);
			});
			this.selectedShapes = [];
			this.state.addState([...this.shapes]);
			this.redraw();
		}
	}

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
			this.state.addState([...this.shapes]);
			this.redraw();
		}
	}

	addShape(shape) {
		shape.id = shape.id || `shape_${Date.now()}`;
		shape.styles = { ...AdvancedStyles, ...shape.styles };
		this.shapes.push(shape);
		this.state.addState([...this.shapes]);
		this.redraw();
	}

	copySelected() {
		this.clipboard = this.selectedShapes.map((shape) => ({ ...shape }));
	}

	pasteClipboard() {
		const newElements = this.clipboard.map((shape) => {
			const newShape = { ...shape, id: `shape_${Date.now()}` };
			newShape.x += 20;
			newShape.y += 20;
			return newShape;
		});
		this.shapes.push(...newElements);
		this.selectedShapes = newElements;
		this.state.addState([...this.shapes]);
		this.redraw();
	}

	nestElement(parentId, childId) {
		const parent = this.getElementById(parentId);
		const child = this.getElementById(childId);
		if (parent && child && parent !== child) {
			this.shapes = this.shapes.filter((s) => s.id !== childId);
			child.x -= parent.x;
			child.y -= parent.y;
			parent.children.push(child);
			if (parent.type === "div") {
				parent.styles.display = "flex"; // Simulate flexbox for div
			}
			this.state.addState([...this.shapes]);
			this.redraw();
		}
	}

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

	animateElement(id) {
		const shape = this.getElementById(id);
		if (!shape || !shape.frames || !shape.frames.length) return;

		this.stopAnimation(id);
		this.currentFrameIndex.set(id, 0);
		this.playAnimation(id);
	}

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

	pauseAnimation(id) {
		if (this.animationFrames.has(id)) {
			this.pausedAnimations.add(id);
		}
	}

	stopAnimation(id) {
		const frameId = this.animationFrames.get(id);
		if (frameId) {
			cancelAnimationFrame(frameId);
			this.animationFrames.delete(id);
			this.pausedAnimations.delete(id);
		}
	}

	undo() {
		this.shapes = this.state.undo() || [];
		this.selectedShapes = [];
		this.redraw();
	}

	redo() {
		this.shapes = this.state.redo() || [];
		this.selectedShapes = [];
		this.redraw();
	}

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
				};
				return clonedShape;
			});

		this.shapes = cloneShapes(shapes);
		this.state.addState([...this.shapes]);
		this.redraw();
	}

	centerChildrenInParent(parentId) {
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
			child.x = (parentWidth - childWidth) / 2;
			child.y = (parentHeight - childHeight) / 2;
		});

		this.state.addState([...this.shapes]);
		this.redraw();
	}

	// New method to return acceptable types
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
		];
	}

	// New function to create special shapes with file selection for image/video
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
				case "image": {
					const input = document.createElement("input");
					input.type = "file";
					input.accept = "image/*";
					input.onchange = (e) => {
						const file = e.target.files[0];
						if (file) {
							const reader = new FileReader();
							reader.onload = (event) => {
								resolve({
									...baseProps,
									src: event.target.result,
									width: "200px",
									height: "200px",
								});
							};
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
					input.click();
					break;
				}
				case "video": {
					const input = document.createElement("input");
					input.type = "file";
					input.accept = "video/*";
					input.onchange = (e) => {
						const file = e.target.files[0];
						if (file) {
							const reader = new FileReader();
							reader.onload = (event) => {
								resolve({
									...baseProps,
									src: event.target.result,
									width: "300px",
									height: "200px",
								});
							};
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
					input.click();
					break;
				}
				case "scroll":
					resolve({
						...baseProps,
						scrollDirection: "column",
						scrollOffset: 0, // Initial scroll position
						width: "200px",
						height: "200px",
						styles: { ...baseProps.styles, overflow: "auto" },
					});
					break;
				default:
					resolve(this.createShape(type, x, y));
			}
		});
	}

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
		const x = shape.x + parentX;
		const y = shape.y + parentY;

		this.ctx.save();
		this.ctx.globalAlpha = parseFloat(shape.styles.opacity);
		this.ctx.translate(x + width / 2, y + height / 2);
		const rotation = this.getRotationAngle(shape);
		this.ctx.rotate((rotation * Math.PI) / 180);
		this.ctx.translate(-(x + width / 2), -(y + height / 2));

		this.applyStyles(shape.styles);

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
				this.ctx.fillText(shape.text, x, y + parseFloat(shape.styles.fontSize));
				this.ctx.strokeRect(x, y, width, height);
				break;
			case "group":
				shape.children.forEach((child) => this.drawShape(child, x, y));
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
			case "div":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				if (shape.children.length && shape.styles.display === "flex") {
					const direction = shape.styles.flexDirection;
					let offsetX = 0,
						offsetY = 0;
					shape.children.forEach((child) => {
						child.x = direction === "row" ? offsetX : 0;
						child.y = direction === "column" ? offsetY : 0;
						this.drawShape(child, x, y);
						offsetX +=
							direction === "row"
								? this.calculateDimension(child.width, width, height)
								: 0;
						offsetY +=
							direction === "column"
								? this.calculateDimension(child.height, width, height)
								: 0;
					});
				}
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
				this.ctx.fillStyle = shape.styles.color;
				this.ctx.font = `${shape.styles.fontSize} ${shape.styles.fontFamily}`;
				this.ctx.textAlign = "center";
				this.ctx.fillText(
					"Video Placeholder",
					x + width / 2,
					y + height / 2 + 5
				);
				break;
			case "scroll":
				this.ctx.fillRect(x, y, width, height);
				this.ctx.strokeRect(x, y, width, height);
				if (shape.children.length) {
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
						this.drawShape(child, x, y);
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
		}
		this.ctx.restore();
	}

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

	setOverlay(show) {
		this.showOverlay = show;
		this.redraw();
	}

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
		} else if (shape) {
			this.isDragging = true;
			if (e.ctrlKey || e.metaKey) {
				if (!this.selectedShapes.includes(shape)) {
					this.selectedShapes.push(shape);
				}
			} else {
				this.selectedShapes = [shape];
			}

			// Interactivity for checkbox and selector
			if (shape.type === "checkbox") {
				shape.checked = !shape.checked;
				this.state.addState([...this.shapes]);
				this.redraw();
			} else if (shape.type === "selector") {
				const currentIndex = shape.options.indexOf(shape.selectedOption);
				const nextIndex = (currentIndex + 1) % shape.options.length;
				shape.selectedOption = shape.options[nextIndex];
				this.state.addState([...this.shapes]);
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
			].includes(this.currentShape)
				? this.createSpecialShape(this.currentShape, x, y)
				: Promise.resolve(this.createShape(this.currentShape, x, y));
			createShapePromise.then((newShape) => {
				this.shapes.push(newShape);
				this.state.addState([...this.shapes]);
				this.redraw();
			});
		} else {
			this.selectedShapes = [];
		}
		this.redraw();
	}

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
			this.redraw();
		} else if (this.isResizing && this.selectedShapes[0]) {
			const shape = this.selectedShapes[0];
			this.resizeShape(shape, x, y, this.resizeHandle);
			this.restrictWithinBounds(shape);
			this.redraw();
		} else if (this.isDragging && this.selectedShapes.length) {
			const dx = x - this.startX;
			const dy = y - this.startY;
			this.selectedShapes.forEach((shape) => {
				shape.x += dx;
				shape.y += dy;
				this.restrictWithinBounds(shape);
			});
			this.startX = x;
			this.startY = y;
			this.redraw();
		} else if (this.isDrawing && this.currentShape) {
			const shape = this.shapes[this.shapes.length - 1];
			this.updateShapeDimensions(shape, x, y);
			this.restrictWithinBounds(shape);
			this.redraw();
		}
	}

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
	}

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
			].includes(type)
				? this.createSpecialShape(type, x, y)
				: Promise.resolve(this.createShape(type, x, y));
			createShapePromise.then((newShape) => {
				this.shapes.push(newShape);
				this.state.addState([...this.shapes]);
				this.redraw();
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

	// New scroll handler
	handleScroll(e) {
		const { x, y } = this.getMousePos(e);
		const shape = this.findShapeAtPoint(x, y);
		if (shape && shape.type === "scroll" && shape.children.length) {
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
			this.redraw();
		}
	}

	getMousePos(e) {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
			y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
		};
	}

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
				return { ...baseProps, x2: x, y2: y };
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
				};
			case "group":
				return { ...baseProps };
			default:
				throw new Error(`Unknown shape type: ${type}`);
		}
	}

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
}

// Usage example:
/*
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const cm = new CanvasManipulator(canvas, {
    width: 800,
    height: 600,
    backgroundColor: '#f5f5f5',
    showOverlay: true
});
cm.startDrawing('scroll');
// After drawing, nest elements
const scrollShape = cm.shapes[cm.shapes.length - 1];
const child1 = await cm.createSpecialShape('button', 0, 0);
const child2 = await cm.createSpecialShape('checkbox', 0, 0);
cm.nestElement(scrollShape.id, child1.id);
cm.nestElement(scrollShape.id, child2.id);
cm.updateShapeProperty(scrollShape.id, 'scrollDirection', 'column');
console.log(cm.getAcceptedTypes());
*/
