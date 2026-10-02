"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { saveProposalDraft } from "./actions";

const builderSchema = z.object({
  title: z.string().trim().min(2, "Enter a proposal title.").max(180),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  expiresOn: z.string(),
  termsText: z.string().max(20_000),
  lineItems: z.array(
    z.object({
      label: z.string().trim().min(1, "Enter a line-item label.").max(180),
      description: z.string().max(1000),
      quantity: z.coerce.number().positive("Quantity must be greater than zero."),
      unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
    }),
  ).min(1),
});

type BuilderValues = z.infer<typeof builderSchema>;

type InitialLineItem = {
  id: string;
  label: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
};

type ProposalBuilderProps = {
  proposal: {
    id: string;
    title: string;
    currency: string;
    terms_text: string;
    expires_at: string | null;
  };
  lineItems: InitialLineItem[];
};

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function ProposalBuilder({ proposal, lineItems }: ProposalBuilderProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<BuilderValues>({
    defaultValues: {
      title: proposal.title,
      currency: proposal.currency.trim(),
      expiresOn: dateValue(proposal.expires_at),
      termsText: proposal.terms_text,
      lineItems: lineItems.length
        ? lineItems.map((item) => ({
            label: item.label,
            description: item.description ?? "",
            quantity: Number(item.quantity),
            unitPrice: item.unit_price_cents / 100,
          }))
        : [{ label: "", description: "", quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const watchedItems = watch("lineItems");
  const estimatedTotal = (watchedItems ?? []).reduce((sum, item) => {
    const quantity = Number(item?.quantity) || 0;
    const price = Number(item?.unitPrice) || 0;
    return sum + quantity * price;
  }, 0);

  const onSubmit = handleSubmit(async (values) => {
    setMessage("");
    const parsed = builderSchema.safeParse(values);

    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const [first, second, third] = issue.path;
        if (first === "title" || first === "currency" || first === "expiresOn" || first === "termsText") {
          setError(first, { message: issue.message });
        } else if (first === "lineItems" && typeof second === "number" && typeof third === "string") {
          setError(`lineItems.${second}.${third as "label" | "description" | "quantity" | "unitPrice"}`, { message: issue.message });
        }
      });
      return;
    }

    setSaving(true);
    const result = await saveProposalDraft({
      proposalId: proposal.id,
      title: parsed.data.title,
      currency: parsed.data.currency,
      expiresOn: parsed.data.expiresOn || null,
      termsText: parsed.data.termsText,
      lineItems: parsed.data.lineItems.map((item) => ({
        label: item.label,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: Math.round(item.unitPrice * 100),
      })),
    });

    if (!result.ok) {
      setMessage(result.error);
      setSaving(false);
      return;
    }

    setMessage("Draft saved.");
    setSaving(false);
    router.refresh();
  });

  return (
    <form className="proposal-builder" onSubmit={onSubmit} noValidate>
      <div className="proposal-builder__header">
        <div className="field">
          <label htmlFor="builder-title">Proposal title</label>
          <input id="builder-title" {...register("title")} aria-invalid={Boolean(errors.title)} />
          {errors.title ? <span className="field-message">{errors.title.message}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="builder-expires">Expires on</label>
          <input id="builder-expires" type="date" {...register("expiresOn")} />
        </div>
        <div className="field">
          <label htmlFor="builder-currency">Currency</label>
          <input id="builder-currency" maxLength={3} {...register("currency")} aria-invalid={Boolean(errors.currency)} />
          {errors.currency ? <span className="field-message">{errors.currency.message}</span> : null}
        </div>
      </div>

      <div className="line-item-editor">
        <div className="panel-heading">
          <h3>Line items</h3>
          <p>Amounts are stored in cents and calculated again in the database when the draft is saved.</p>
        </div>

        {fields.map((field, index) => (
          <fieldset className="line-item-row" key={field.id}>
            <legend className="sr-only">Line item {index + 1}</legend>
            <div className="field line-item-row__label">
              <label htmlFor={`line-label-${index}`}>Service</label>
              <input id={`line-label-${index}`} {...register(`lineItems.${index}.label`)} />
              {errors.lineItems?.[index]?.label ? <span className="field-message">{errors.lineItems[index]?.label?.message}</span> : null}
            </div>
            <div className="field line-item-row__description">
              <label htmlFor={`line-description-${index}`}>Description</label>
              <input id={`line-description-${index}`} {...register(`lineItems.${index}.description`)} />
            </div>
            <div className="field">
              <label htmlFor={`line-quantity-${index}`}>Qty</label>
              <input id={`line-quantity-${index}`} type="number" step="0.01" min="0.01" {...register(`lineItems.${index}.quantity`, { valueAsNumber: true })} />
            </div>
            <div className="field">
              <label htmlFor={`line-price-${index}`}>Unit price</label>
              <input id={`line-price-${index}`} type="number" step="0.01" min="0" {...register(`lineItems.${index}.unitPrice`, { valueAsNumber: true })} />
            </div>
            <button className="text-button line-item-row__remove" type="button" onClick={() => remove(index)} disabled={fields.length === 1}>Remove</button>
          </fieldset>
        ))}

        <button className="button button--secondary" type="button" onClick={() => append({ label: "", description: "", quantity: 1, unitPrice: 0 })}>
          Add line item
        </button>
      </div>

      <div className="field">
        <label htmlFor="builder-terms">Terms</label>
        <textarea id="builder-terms" rows={12} {...register("termsText")} />
        {errors.termsText ? <span className="field-message">{errors.termsText.message}</span> : null}
      </div>

      <div className="proposal-builder__footer">
        <div>
          <span>Estimated total</span>
          <strong>{money(estimatedTotal)}</strong>
        </div>
        <button className="button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
      </div>

      {message ? <p className={message === "Draft saved." ? "notice" : "form-error alert-box"} role="status">{message}</p> : null}
    </form>
  );
}
