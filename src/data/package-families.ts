/** Definition of a package family with version alignment. */
interface FamilyDef {
    readonly label: string;
    readonly pattern: RegExp;
}

/** Known package families where major version alignment matters. */
const FAMILIES: Record<string, FamilyDef> = {
    firebase: {
        label: 'Firebase',
        pattern: /^(firebase_|cloud_|flutterfire)/,
    },
    google: {
        label: 'Google',
        pattern: /^google_/,
    },
    riverpod: {
        label: 'Riverpod',
        pattern: /^(riverpod|flutter_riverpod|hooks_riverpod)$/,
    },
    bloc: {
        label: 'Bloc',
        pattern: /^(bloc|flutter_bloc|hydrated_bloc|replay_bloc)$/,
    },
    freezed: {
        label: 'Freezed',
        pattern: /^(freezed|freezed_annotation|json_serializable)$/,
    },
    drift: {
        label: 'Drift',
        pattern: /^(drift|drift_dev|drift_postgres)$/,
    },
};

/** Match a package name to a known family. */
export function matchFamily(
    name: string,
): { readonly id: string; readonly label: string } | null {
    for (const [id, def] of Object.entries(FAMILIES)) {
        if (def.pattern.test(name)) {
            return { id, label: def.label };
        }
    }
    return null;
}
