import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { color, space, radius, type } from '../lib/theme';
import { uploadDeliverable, Deliverable } from '../lib/data';

type Props = {
  taskId: string;
  existing: Deliverable[];
  onUploaded: (d: Deliverable) => void;
  onDelete: (d: Deliverable) => void;
};

export function DeliverableUploader({ taskId, existing, onUploaded, onDelete }: Props) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<any>(null);

  async function uploadFromNativeUri(uri: string, name: string, mimeType: string) {
    const { File } = require('expo-file-system/next') as {
      File: new (uri: string) => { bytes(): Promise<Uint8Array> };
    };
    const file = new File(uri);
    const bytes = await file.bytes();
    const created = await uploadDeliverable(taskId, name, bytes, mimeType || 'application/octet-stream');
    onUploaded(created);
  }

  async function pickFiles() {
    try {
      setBusy(true);
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets) return;
      for (const asset of result.assets) {
        if (Platform.OS === 'web') {
          const webFile = (asset as unknown as { file?: globalThis.File }).file;
          if (webFile) await uploadWebFile(webFile);
        } else {
          await uploadFromNativeUri(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
        }
      }
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadWebFile(file: globalThis.File) {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const created = await uploadDeliverable(taskId, file.name, bytes, file.type || 'application/octet-stream');
    onUploaded(created);
  }

  async function handleDrop(e: any) {
    e.preventDefault();
    setDragOver(false);
    const files: globalThis.File[] = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) await uploadWebFile(f);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const webDragProps =
    Platform.OS === 'web'
      ? {
          onDragOver: (e: any) => {
            e.preventDefault();
            setDragOver(true);
          },
          onDragLeave: () => setDragOver(false),
          onDrop: handleDrop,
        }
      : {};

  return (
    <View>
      <Pressable
        ref={dropRef}
        onPress={pickFiles}
        disabled={busy}
        {...webDragProps}
        style={[
          styles.dropzone,
          dragOver && { borderColor: color.accent, backgroundColor: color.accentSoft },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={color.accent} />
        ) : (
          <>
            <Text style={{ fontSize: 22 }}>⬆</Text>
            <Text style={[type.bodyMedium, { marginTop: space.xs, color: color.ink }]}>
              {Platform.OS === 'web' ? 'Drag files here, or tap to browse' : 'Tap to add deliverables'}
            </Text>
            <Text style={[type.caption, { color: color.inkFaint }]}>
              Add as many as you need — proof of submission, exports, screenshots
            </Text>
          </>
        )}
      </Pressable>

      {existing.length > 0 && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {existing.map((d) => (
            <View key={d.id} style={styles.fileRow}>
              <Text style={{ fontSize: 16 }}>📄</Text>
              <Text style={[type.body, { flex: 1, marginLeft: space.sm, color: color.ink }]} numberOfLines={1}>
                {d.file_name}
              </Text>
              <Pressable onPress={() => onDelete(d)} hitSlop={8}>
                <Text style={{ color: color.inkFaint, fontSize: 13 }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingVertical: space.xl,
    alignItems: 'center',
    backgroundColor: color.surface,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
