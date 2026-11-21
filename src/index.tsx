import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * @fiscalisto/react: Fiscalisto's hosted pages inside your React app. Your business's
 * autofactura portal (`portal_url` from GET /v1/issuers/{id}/self_invoicing, with the invoice
 * filling in beside the form like a checkout), a ticket's (`ticket.url` from POST /v1/tickets) or
 * a customer data request (`customer_data_request.url`), in a frame that grows with its content,
 * or on top of your page. The same as fiscalisto.js (https://fiscalisto.com/js/fiscalisto.js),
 * without a script tag.
 *
 * The buyer's fiscal data never reaches your page: when they finish, `onComplete` says so (with
 * the stamped invoice's UUID for a ticket); read the rest with the API or your webhook.
 */

export type FiscalistoCompletion =
	| { kind: "ticket"; uuid: string | null }
	| { kind: "customer_data" };

/** How the page looks inside yours (like Stripe Elements' `appearance`). */
export interface FiscalistoAppearance {
	/** "auto" (the default) follows the buyer's device. */
	theme?: "light" | "dark" | "auto";
	/** The button and focus color, "#rrggbb". */
	accent?: string;
	/** Corner radius in pixels, 0 to 24. */
	radius?: number;
}

export interface FiscalistoEmbedProps {
	/** `portal_url`, `ticket.url` or `customer_data_request.url`, as the API answered it. */
	url: string;
	appearance?: FiscalistoAppearance;
	/** false hides the live invoice beside the form. */
	preview?: boolean;
	/** The ticket's code and total: the portal finds it by itself. */
	code?: string;
	total?: number;
	/** The invoice was stamped, or the data was sent. */
	onComplete?: (e: FiscalistoCompletion) => void;
	/** The page finished loading. */
	onReady?: () => void;
	/** Height before the page says its own, in pixels. 560 by default. */
	initialHeight?: number;
	/** The frame's title for screen readers. «Facturación» by default. */
	title?: string;
	className?: string;
	style?: CSSProperties;
}

type Message =
	| { fiscalisto: 1; event: "ready" }
	| { fiscalisto: 1; event: "resize"; height: number; wide?: boolean }
	| { fiscalisto: 1; event: "completed"; kind: "ticket"; uuid?: string | null }
	| { fiscalisto: 1; event: "completed"; kind: "customer_data" };

const hex = (value: string | undefined) => {
	const h = (value ?? "").trim().replace(/^#/, "").toLowerCase();
	if (/^[0-9a-f]{6}$/.test(h)) return h;
	if (/^[0-9a-f]{3}$/.test(h))
		return h
			.split("")
			.map((c) => c + c)
			.join("");
	return null;
};

/** The link with ?embed=1 and its look; only autofactura and data request links are shown. */
export function embedUrl(
	url: string,
	options: Pick<FiscalistoEmbedProps, "appearance" | "preview" | "code" | "total"> & {
		/** Opened in FiscalistoDialog: the dialog sizes the frame and the page fills it. */
		frame?: "dialog";
	} = {},
): URL {
	const u = new URL(url);
	if (u.protocol !== "https:" && u.hostname !== "localhost")
		throw new Error("Fiscalisto: la liga debe ser https.");
	if (!/^\/(autofactura|datos)\//.test(u.pathname))
		throw new Error("Fiscalisto: solo se muestran ligas de autofactura o de datos fiscales.");
	u.searchParams.set("embed", "1");
	const a = options.appearance ?? {};
	if (a.theme === "light" || a.theme === "dark") u.searchParams.set("theme", a.theme);
	const accent = hex(a.accent);
	if (accent) u.searchParams.set("accent", accent);
	if (typeof a.radius === "number" && Number.isFinite(a.radius))
		u.searchParams.set("radius", String(Math.min(24, Math.max(0, Math.round(a.radius)))));
	if (options.preview === false) u.searchParams.set("preview", "0");
	if (options.code) u.searchParams.set("c", options.code);
	if (options.total) u.searchParams.set("t", String(options.total));
	if (options.frame === "dialog") u.searchParams.set("frame", "dialog");
	return u;
}

/** The page inside yours, as tall as its content. */
export function FiscalistoEmbed(props: FiscalistoEmbedProps) {
	return <Frame {...props} />;
}

/**
 * The frame. In FiscalistoDialog (`sized`) the dialog chooses its height and hears the content's
 * own (`onSize`, with whether the invoice can sit beside the form); elsewhere it grows with it.
 */
function Frame({
	url,
	appearance,
	preview,
	code,
	total,
	onComplete,
	onReady,
	initialHeight = 560,
	title = "Facturación",
	className,
	style,
	sized,
}: FiscalistoEmbedProps & {
	sized?: { height: number | string; onSize: (height: number, wide?: boolean) => void };
}) {
	const ref = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(initialHeight);
	const loading = useLoading();
	const src = embedUrl(url, {
		appearance,
		preview,
		code,
		total,
		frame: sized ? "dialog" : undefined,
	});
	const origin = src.origin;
	// The latest callbacks, without listening again on every render.
	const handlers = useRef({ onComplete, onReady, onSize: sized?.onSize, ready: loading.ready });
	handlers.current = { onComplete, onReady, onSize: sized?.onSize, ready: loading.ready };

	useEffect(() => {
		function onMessage(e: MessageEvent) {
			if (e.source !== ref.current?.contentWindow || e.origin !== origin) return;
			const data = e.data as Message | undefined;
			if (!data || data.fiscalisto !== 1) return;
			if (data.event === "ready") {
				handlers.current.ready();
				handlers.current.onReady?.();
			} else if (data.event === "resize") {
				setHeight(Math.max(200, data.height));
				handlers.current.onSize?.(data.height, data.wide);
			} else if (data.event === "completed")
				handlers.current.onComplete?.(
					data.kind === "ticket"
						? { kind: "ticket", uuid: data.uuid ?? null }
						: { kind: "customer_data" },
				);
		}
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [origin]);

	const iframe = (
		<iframe
			ref={ref}
			src={src.toString()}
			title={title}
			allow="camera"
			className={className}
			onLoad={loading.loaded}
			style={{
				display: "block",
				width: "100%",
				border: 0,
				background: "transparent",
				...(sized ? { flex: 1, minHeight: 0 } : { height, transition: "height .15s ease" }),
				...(sized ? undefined : style),
			}}
		/>
	);
	return (
		<div
			style={
				sized
					? {
							position: "relative",
							display: "flex",
							flexDirection: "column",
							height: sized.height,
							...style,
						}
					: { position: "relative" }
			}
		>
			{iframe}
			{loading.show ? (
				<Skeleton
					appearance={appearance}
					fading={loading.fading}
					onGone={loading.gone}
				/>
			) : null}
		</div>
	);
}

/**
 * While the page loads: nothing for the first 60 ms (a page that is quick, or cached, opens
 * with no flash), then its skeleton until the page says it is ready (or, for a page that never
 * says so, a moment after the frame loaded), fading into the page.
 */
function useLoading() {
	const [state, setState] = useState<"wait" | "skeleton" | "fading" | "done">("wait");
	const ready = useCallback(
		() => setState((s) => (s === "skeleton" ? "fading" : s === "wait" ? "done" : s)),
		[],
	);
	useEffect(() => {
		const t = setTimeout(() => setState((s) => (s === "wait" ? "skeleton" : s)), 60);
		return () => clearTimeout(t);
	}, []);
	const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (fallback.current) clearTimeout(fallback.current);
		},
		[],
	);
	const loaded = useCallback(() => {
		if (fallback.current) clearTimeout(fallback.current);
		fallback.current = setTimeout(ready, 1500);
	}, [ready]);
	const gone = useCallback(() => setState("done"), []);
	return {
		show: state === "skeleton" || state === "fading",
		fading: state === "fading",
		ready,
		loaded,
		gone,
	};
}

/** The page's shape (a title, the fields, the button) in its own colors, over the frame. */
function Skeleton({
	appearance,
	fading,
	onGone,
}: {
	appearance?: FiscalistoAppearance;
	fading: boolean;
	onGone: () => void;
}) {
	const dark = isDark(appearance);
	const radius =
		typeof appearance?.radius === "number" && Number.isFinite(appearance.radius)
			? Math.min(24, Math.max(0, Math.round(appearance.radius)))
			: 8;
	const accent = hex(appearance?.accent) ?? "0f766e";
	const block = (width: number | string, h: number, color?: string): CSSProperties => ({
		width,
		height: h,
		borderRadius: Math.min(radius, h / 2),
		background: color ?? (dark ? "rgba(255,255,255,.08)" : "rgba(13,43,41,.07)"),
	});
	const field = (label: number) => (
		<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
			<div style={block(label, 12)} />
			<div style={block("100%", 40)} />
		</div>
	);
	return (
		<div
			aria-hidden="true"
			data-fiscalisto-skeleton=""
			onTransitionEnd={fading ? onGone : undefined}
			style={{
				position: "absolute",
				inset: 0,
				overflow: "hidden",
				background: dark ? "#0d0d0f" : "#ffffff",
				opacity: fading ? 0 : 1,
				transition: "opacity .2s ease",
				pointerEvents: fading ? "none" : "auto",
			}}
		>
			<style>
				{
					"@keyframes fiscalisto-pulse{50%{opacity:.55}}@media (prefers-reduced-motion:reduce){[data-fiscalisto-skeleton]>div{animation:none!important}}"
				}
			</style>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 20,
					maxWidth: 480,
					padding: 20,
					animation: "fiscalisto-pulse 1.4s ease-in-out infinite",
				}}
			>
				<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
					<div style={block(220, 22)} />
					<div style={block("80%", 12)} />
				</div>
				{field(120)}
				{field(160)}
				{field(90)}
				<div style={block("100%", 44, `#${accent}`)} />
			</div>
		</div>
	);
}

function isDark(appearance?: FiscalistoAppearance) {
	return (
		appearance?.theme === "dark" ||
		(appearance?.theme !== "light" &&
			typeof window !== "undefined" &&
			!!window.matchMedia?.("(prefers-color-scheme: dark)").matches)
	);
}

export interface FiscalistoDialogProps extends Omit<FiscalistoEmbedProps, "className" | "style"> {
	open: boolean;
	/** The ×, Esc or a click outside. */
	onClose: () => void;
	/** Shown above the page, like «Facture su compra». */
	heading?: ReactNode;
}

/**
 * The page on top of yours. Controlled: `open` and `onClose`. Closes nothing by itself when the
 * buyer finishes, so they can download their PDF and XML; close it from `onComplete` if you want.
 */
export function FiscalistoDialog({
	open,
	onClose,
	heading,
	title = "Facturación",
	...embed
}: FiscalistoDialogProps) {
	const close = useRef<HTMLButtonElement>(null);
	const screen = useScreen(open);
	const [content, setContent] = useState<{ height: number; wide?: boolean } | null>(null);
	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement as HTMLElement | null;
		const overflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";
		close.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.documentElement.style.overflow = overflow;
			previous?.focus?.();
		};
	}, [open, onClose]);
	const onSize = useCallback(
		(height: number, wide?: boolean) => setContent({ height, wide }),
		[],
	);
	if (!open) return null;
	const dark = isDark(embed.appearance);
	const box = dialogBox(screen, {
		height: content?.height,
		wide: embed.preview === false ? false : (content?.wide ?? true),
		heading: !!heading,
	});
	const closeButton = (
		<button
			ref={close}
			type="button"
			aria-label="Cerrar"
			onClick={onClose}
			style={{
				...(heading
					? { flex: "none" }
					: { position: "absolute", top: 10, right: 10, zIndex: 1 }),
				width: 32,
				height: 32,
				border: 0,
				borderRadius: 999,
				background: dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.06)",
				color: dark ? "#e6efee" : "#333",
				font: "20px/32px system-ui, sans-serif",
				cursor: "pointer",
			}}
		>
			×
		</button>
	);
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes it (listened on the document); a click outside is the pointer's shortcut.
		<div
			role="dialog"
			aria-modal="true"
			aria-label={title}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: box.full ? "stretch" : "center",
				justifyContent: "center",
				padding: box.full ? 0 : 24,
				background: "rgba(17,17,17,.45)",
			}}
		>
			<div
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					width: box.full ? "100%" : box.width,
					maxWidth: "100%",
					height: box.full ? "100dvh" : undefined,
					borderRadius: box.full ? 0 : 16,
					overflow: "hidden",
					// The portal page's own background, so a heading bar and the page read as one.
					background: dark ? "#0d0d0f" : "#ffffff",
					boxShadow: box.full ? "none" : "0 24px 60px rgba(0,0,0,.25)",
					transition: "width .15s ease",
				}}
			>
				{heading ? (
					<div
						style={{
							flex: "none",
							display: "flex",
							alignItems: "center",
							gap: 12,
							height: 56,
							// The title lines up with the page's content: 16 px on a phone, 20 in a box.
							padding: box.full ? "0 12px 0 16px" : "0 12px 0 20px",
							borderBottom: `1px solid ${dark ? "rgba(255,255,255,.075)" : "rgba(13,43,41,.09)"}`,
							font: "600 16px/1.3 system-ui, sans-serif",
							color: dark ? "#e6efee" : "#111",
						}}
					>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{heading}
						</div>
						{closeButton}
					</div>
				) : (
					closeButton
				)}
				<Frame
					title={title}
					{...embed}
					style={box.full ? { flex: 1, minHeight: 0 } : undefined}
					sized={{ height: box.full ? "auto" : box.height, onSize }}
				/>
			</div>
		</div>
	);
}

/** The window's size while the dialog is open, kept current when it turns or resizes. */
function useScreen(open: boolean) {
	const read = () =>
		typeof window === "undefined"
			? { width: 1280, height: 800 }
			: { width: window.innerWidth, height: window.innerHeight };
	const [screen, setScreen] = useState(read);
	useEffect(() => {
		if (!open) return;
		const update = () => setScreen(read());
		update();
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, [open]);
	return screen;
}

/**
 * The dialog's box for the screen (the same rules as fiscalisto.js). A phone, or a window too
 * small for a box, gets the whole screen, the page scrolling inside with its button at the
 * bottom. A computer gets a box as tall as the step (up to the window): 520 px wide, or up to
 * 960 with the invoice beside the form when the window is wide enough and the page has it.
 */
export function dialogBox(
	screen: { width: number; height: number },
	content: { height?: number; wide?: boolean; heading?: boolean } = {},
): { full: true } | { full: false; width: number; height: number } {
	if (screen.width < 640 || screen.height < 520) return { full: true };
	const side = content.wide !== false && screen.width >= 1024;
	const room = screen.height - 48 - (content.heading ? 56 : 0);
	const height = Math.min(room, side ? 760 : 820, Math.max(360, content.height ?? 640));
	return { full: false, width: side ? Math.min(960, screen.width - 48) : 520, height };
}

/** `const { open, dialog } = useFiscalistoDialog()`: `open(url)` from a button, `{dialog}` in your tree. */
export function useFiscalistoDialog(
	options: Omit<FiscalistoDialogProps, "open" | "onClose" | "url"> & {
		onClose?: () => void;
	} = {},
) {
	const [url, setUrl] = useState<string | null>(null);
	const { onClose, ...rest } = options;
	const close = useCallback(() => {
		setUrl(null);
		onClose?.();
	}, [onClose]);
	const dialog = url ? (
		<FiscalistoDialog
			{...rest}
			url={url}
			open
			onClose={close}
		/>
	) : null;
	return { open: setUrl as (url: string) => void, close, dialog };
}
