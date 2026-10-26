# @fiscalisto/react

Muestre en su aplicación de React la autofactura de Fiscalisto y la liga de datos fiscales de un
cliente, sin que su comprador salga de su página.

```bash
npm install @fiscalisto/react
```

## Autofactura de un ticket

En su servidor registre la venta con el SDK (`fiscalisto.tickets.create`) y mande `ticket.url` a
su página. Ahí:

```tsx
import { FiscalistoEmbed } from "@fiscalisto/react";

export function Facturar({ url }: { url: string }) {
	return (
		<FiscalistoEmbed
			url={url}
			onComplete={(e) => {
				if (e.kind === "ticket") console.log("Factura timbrada", e.uuid);
			}}
		/>
	);
}
```

El comprador escribe el total de su ticket y sus datos fiscales, y la factura se timbra en ese
momento con sus timbres. El marco crece con su contenido.

## En una ventana encima de su página

```tsx
import { useFiscalistoDialog } from "@fiscalisto/react";

export function BotonFacturar({ url }: { url: string }) {
	const { open, dialog } = useFiscalistoDialog({ heading: "Facture su compra" });
	return (
		<>
			<button onClick={() => open(url)}>Facturar mi compra</button>
			{dialog}
		</>
	);
}
```

`FiscalistoDialog` hace lo mismo controlado con `open` y `onClose`.

## Datos fiscales de un cliente

Con `customer_data_request.url` (POST /v1/customer_data_requests) el mismo componente muestra el
formulario de datos fiscales: su cliente los escribe o los toma de su constancia, y Fiscalisto
los revisa con las reglas del SAT. `onComplete` llega con `{ kind: "customer_data" }`.

## Qué llega a su página

Solo que terminó (y el UUID de la factura de un ticket). Los datos fiscales de su comprador nunca
pasan por su página: léalos con la API o espere su webhook (`ticket.invoiced`,
`customer_data_request.completed`).

Sin React, use `<script src="https://fiscalisto.com/js/fiscalisto.js" defer></script>` y
`Fiscalisto.open(url)` o `Fiscalisto.mount("#factura", url)`.

Guía completa: https://fiscalisto.com/docs/api/autofactura
