// ---------------------------------------------------------------------------
// Field type descriptors — the building blocks of a schema
// ---------------------------------------------------------------------------

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "union"
  | "optional";

// Infer the TypeScript type from a FieldDescriptor at the type level
export type InferField<F extends FieldDescriptor> =
  F extends StringField ? string
  : F extends NumberField ? number
  : F extends BooleanField ? boolean
  : F extends ArrayField<infer I> ? Array<InferField<I>>
  : F extends ObjectField<infer S> ? InferShape<S>
  : F extends UnionField<infer U> ? U
  : F extends OptionalField<infer I> ? InferField<I> | undefined
  : never;

export type InferShape<S extends SchemaShape> = {
  [K in RequiredKeys<S>]: InferField<S[K]>;
} & {
  [K in OptionalKeys<S>]?: InferField<Unwrap<S[K]>>;
};

type RequiredKeys<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends OptionalField<FieldDescriptor> ? never : K;
}[keyof S];

type OptionalKeys<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends OptionalField<FieldDescriptor> ? K : never;
}[keyof S];

type Unwrap<F extends FieldDescriptor> =
  F extends OptionalField<infer I> ? I : never;

export type SchemaShape = Record<string, FieldDescriptor>;

// ---------------------------------------------------------------------------
// Field descriptor classes
// ---------------------------------------------------------------------------

export abstract class FieldDescriptor {
  abstract readonly kind: FieldKind;
  readonly _coerce: boolean = false;

  coerce(): this {
    // Return a new instance of the same class with _coerce set to true
    const clone = Object.create(Object.getPrototypeOf(this)) as this;
    Object.assign(clone, this, { _coerce: true });
    return clone;
  }
}

export class StringField extends FieldDescriptor {
  readonly kind = "string" as const;
}

export class NumberField extends FieldDescriptor {
  readonly kind = "number" as const;
}

export class BooleanField extends FieldDescriptor {
  readonly kind = "boolean" as const;
}

export class ArrayField<Item extends FieldDescriptor> extends FieldDescriptor {
  readonly kind = "array" as const;
  constructor(readonly item: Item) {
    super();
  }
}

export class ObjectField<S extends SchemaShape> extends FieldDescriptor {
  readonly kind = "object" as const;
  constructor(readonly shape: S) {
    super();
  }
}

export class UnionField<U extends string> extends FieldDescriptor {
  readonly kind = "union" as const;
  constructor(readonly members: readonly U[]) {
    super();
  }
}

export class OptionalField<Inner extends FieldDescriptor> extends FieldDescriptor {
  readonly kind = "optional" as const;
  constructor(readonly inner: Inner) {
    super();
  }

  // Optional fields delegate coerce to their inner field
  override coerce(): this {
    const newInner = this.inner.coerce();
    const clone = new OptionalField(newInner) as this;
    return clone;
  }
}

// ---------------------------------------------------------------------------
// Public builder API — t.string(), t.number(), etc.
// ---------------------------------------------------------------------------

export const t = {
  string: (): StringField => new StringField(),
  number: (): NumberField => new NumberField(),
  boolean: (): BooleanField => new BooleanField(),
  array: <I extends FieldDescriptor>(item: I): ArrayField<I> => new ArrayField(item),
  object: <S extends SchemaShape>(shape: S): ObjectField<S> => new ObjectField(shape),
  union: <U extends string>(members: readonly U[]): UnionField<U> => new UnionField(members),
  optional: <I extends FieldDescriptor>(inner: I): OptionalField<I> => new OptionalField(inner),
};
