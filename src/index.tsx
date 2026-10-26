import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * @fiscalisto/react: Fiscalisto's hosted pages inside your React app. A ticket's autofactura
 * portal (`ticket.url` from POST /v1/tickets) or a customer data request
 * (`customer_data_request.url`), in a frame that grows with its content, or on top of your page.
 * The same as fiscalisto.js (https://fiscalisto.com/js/fiscalisto.js), without a script tag.
 *
 * The buyer's fiscal data never reaches your page: when they finish, `onComplete` says so (with
 * the stamped invoice's UUID for a ticket); read the rest with the API or your webhook.
 */

export type FiscalistoCompletion =
	| { kind: "ticket"; uuid: string | null }
	| { kind: "customer_data" };

export interface FiscalistoEmbedProps {
	/** `ticket.url` or `customer_data_request.url`, as the API answered it. */
	url: string;
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
	| { fiscalisto: 1; event: "resize"; height: number }
	| { fiscalisto: 1; event: "completed"; kind: "ticket"; uuid?: string | null }
	| { fiscalisto: 1; event: "completed"; kind: "customer_data" };

/** The link with ?embed=1; only autofactura and data request links are shown. */
export function embedUrl(url: string): URL {
	const u = new URL(url);
	if (u.protocol !== "https:" && u.hostname !== "localhost")
		throw new Error("Fiscalisto: la liga debe ser https.");
	if (!/^\/(autofactura|datos)\//.test(u.pathname))
		throw new Error("Fiscalisto: solo se muestran ligas de autofactura o de datos fiscales.");
	u.searchParams.set("embed", "1");
	return u;
}

/** The page inside yours, as tall as its content. */
export function FiscalistoEmbed({
	url,
	onComplete,
	onReady,
	initialHeight = 560,
	title = "Facturación",
	className,
	style,
}: FiscalistoEmbedProps) {
	const ref = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(initialHeight);
	const src = embedUrl(url);
	const origin = src.origin;
	// The latest callbacks, without listening again on every render.
	const handlers = useRef({ onComplete, onReady });
	handlers.current = { onComplete, onReady };

	useEffect(() => {
		function onMessage(e: MessageEvent) {
			if (e.source !== ref.current?.contentWindow || e.origin !== origin) return;
			const data = e.data as Message | undefined;
			if (!data || data.fiscalisto !== 1) return;
			if (data.event === "ready") handlers.current.onReady?.();
			else if (data.event === "resize") setHeight(Math.max(200, data.height));
			else if (data.event === "completed")
				handlers.current.onComplete?.(
					data.kind === "ticket"
						? { kind: "ticket", uuid: data.uuid ?? null }
						: { kind: "customer_data" },
				);
		}
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [origin]);

	return (
		<iframe
			ref={ref}
			src={src.toString()}
			title={title}
			allow="camera"
			className={className}
			style={{
				display: "block",
				width: "100%",
				border: 0,
				background: "transparent",
				height,
				transition: "height .15s ease",
				...style,
			}}
		/>
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
	if (!open) return null;
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
				alignItems: "flex-start",
				justifyContent: "center",
				overflowY: "auto",
				padding: "24px 12px",
				background: "rgba(17,17,17,.45)",
			}}
		>
			<div
				style={{
					position: "relative",
					width: "100%",
					maxWidth: 480,
					margin: "auto 0",
					borderRadius: 16,
					overflow: "hidden",
					background: "#fff",
					boxShadow: "0 24px 60px rgba(0,0,0,.25)",
				}}
			>
				<button
					ref={close}
					type="button"
					aria-label="Cerrar"
					onClick={onClose}
					style={{
						position: "absolute",
						top: 8,
						right: 8,
						zIndex: 1,
						width: 32,
						height: 32,
						border: 0,
						borderRadius: 999,
						background: "rgba(0,0,0,.06)",
						color: "#333",
						font: "20px/32px system-ui, sans-serif",
						cursor: "pointer",
					}}
				>
					×
				</button>
				{heading && (
					<div
						style={{
							padding: "16px 48px 0 20px",
							font: "600 16px system-ui, sans-serif",
						}}
					>
						{heading}
					</div>
				)}
				<FiscalistoEmbed
					title={title}
					{...embed}
				/>
			</div>
		</div>
	);
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
