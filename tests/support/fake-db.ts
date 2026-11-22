/**
 * Minimal in-memory implementation of the Realtime Database surface our
 * repositories use. It exists so the domain flow (author -> product -> review ->
 * sale -> delivery) can be exercised without network access.
 *
 * It is NOT a Firebase emulator: it implements get/set/update/remove/
 * transaction/orderByChild/equalTo/limitToFirst/limitToLast with the same
 * semantics our code relies on.
 */

type Tree = Record<string, unknown>;

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function segments(path: string): string[] {
  return path.split('/').filter((part) => part.length > 0);
}

function getAt(tree: Tree, path: string): unknown {
  let node: unknown = tree;
  for (const key of segments(path)) {
    if (node === null || typeof node !== 'object') return null;
    node = (node as Tree)[key];
    if (node === undefined) return null;
  }
  return node === undefined ? null : node;
}

function setAt(tree: Tree, path: string, value: unknown): void {
  const parts = segments(path);
  if (parts.length === 0) {
    for (const key of Object.keys(tree)) delete tree[key];
    if (value && typeof value === 'object') Object.assign(tree, clone(value));
    return;
  }

  let node: Tree = tree;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index] as string;
    const next = node[key];
    if (!next || typeof next !== 'object') node[key] = {};
    node = node[key] as Tree;
  }

  const last = parts[parts.length - 1] as string;
  if (value === null || value === undefined) {
    delete node[last];
  } else {
    node[last] = clone(value);
  }
}

const snapshot = (value: unknown) => ({ val: () => clone(value) });

export class FakeRef {
  constructor(
    private readonly tree: Tree,
    readonly path: string
  ) {}

  async get() {
    return snapshot(getAt(this.tree, this.path));
  }

  async set(value: unknown) {
    setAt(this.tree, this.path, value);
  }

  async remove() {
    setAt(this.tree, this.path, null);
  }

  async update(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      setAt(this.tree, `${this.path}/${key}`, value);
    }
  }

  async transaction(handler: (current: unknown) => unknown) {
    const current = getAt(this.tree, this.path);
    const next = handler(current);
    if (next === undefined) {
      return { committed: false, snapshot: snapshot(current) };
    }
    setAt(this.tree, this.path, next);
    return { committed: true, snapshot: snapshot(next) };
  }

  orderByChild(child: string) {
    return new FakeQuery(this.tree, this.path, { child });
  }

  limitToFirst(limit: number) {
    return new FakeQuery(this.tree, this.path, { limitFirst: limit });
  }

  limitToLast(limit: number) {
    return new FakeQuery(this.tree, this.path, { limitLast: limit });
  }
}

interface QueryOptions {
  child?: string;
  equalTo?: unknown;
  limitFirst?: number;
  limitLast?: number;
}

export class FakeQuery {
  constructor(
    private readonly tree: Tree,
    private readonly path: string,
    private readonly options: QueryOptions
  ) {}

  orderByChild(child: string) {
    return new FakeQuery(this.tree, this.path, { ...this.options, child });
  }

  equalTo(value: unknown) {
    return new FakeQuery(this.tree, this.path, { ...this.options, equalTo: value });
  }

  limitToFirst(limit: number) {
    return new FakeQuery(this.tree, this.path, { ...this.options, limitFirst: limit });
  }

  limitToLast(limit: number) {
    return new FakeQuery(this.tree, this.path, { ...this.options, limitLast: limit });
  }

  async get() {
    const raw = getAt(this.tree, this.path);
    if (!raw || typeof raw !== 'object') return snapshot(null);

    let entries = Object.entries(raw as Tree);
    const { child, equalTo, limitFirst, limitLast } = this.options;

    if (child) {
      entries = entries.sort((a, b) => {
        const left = (a[1] as Tree)?.[child];
        const right = (b[1] as Tree)?.[child];
        return Number(left ?? 0) - Number(right ?? 0);
      });
    }

    if (equalTo !== undefined) {
      entries = entries.filter(([, value]) => {
        if (!child) return false;
        return (value as Tree)?.[child] === equalTo;
      });
    }

    if (limitFirst !== undefined) entries = entries.slice(0, limitFirst);
    if (limitLast !== undefined) entries = entries.slice(-limitLast);

    return snapshot(Object.fromEntries(entries));
  }
}

export class FakeDatabase {
  readonly tree: Tree = {};

  ref(path = ''): FakeRef {
    return new FakeRef(this.tree, path);
  }
}
