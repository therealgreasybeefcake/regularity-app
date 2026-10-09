import React, { useRef, useState } from 'react';
import { View, Animated, PanResponder, StyleSheet, StyleProp, ViewStyle } from 'react-native';

interface ReorderListProps<T> {
  items: T[];
  keyOf: (item: T) => string | number;
  /** Fixed row height (including any gap) — drag maths assumes uniform rows. */
  rowHeight: number;
  /** Render a row; spread `handleProps` onto the drag handle view. */
  renderRow: (item: T, index: number, ctx: { dragging: boolean; handleProps: object }) => React.ReactNode;
  onReorder: (from: number, to: number) => void;
  /** Lets the parent disable scrolling while a row is held. */
  onDragActiveChange?: (active: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Drag-to-reorder for short lists (a team's drivers). Built on PanResponder +
 * Animated so it runs on native and react-native-web without extra native deps.
 * The held row follows the pointer; rows it passes slide out of the way.
 */
export function ReorderList<T>({ items, keyOf, rowHeight, renderRow, onReorder, onDragActiveChange, style }: ReorderListProps<T>) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  const offsetFor = (index: number) => {
    if (!drag || index === drag.from) return 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -rowHeight;
    if (drag.from > drag.to && index >= drag.to && index < drag.from) return rowHeight;
    return 0;
  };

  return (
    <View style={[{ height: items.length * rowHeight }, style]}>
      {items.map((item, index) => (
        <ReorderRow
          key={keyOf(item)}
          index={index}
          count={items.length}
          rowHeight={rowHeight}
          shift={offsetFor(index)}
          onStart={() => {
            setDrag({ from: index, to: index });
            onDragActiveChange?.(true);
          }}
          onMove={(to) => setDrag((d) => (d && d.to !== to ? { ...d, to } : d))}
          onEnd={(to) => {
            setDrag(null);
            onDragActiveChange?.(false);
            if (to !== index) onReorder(index, to);
          }}
          render={(handleProps) => renderRow(item, index, { dragging: drag?.from === index, handleProps })}
        />
      ))}
    </View>
  );
}

interface RowProps {
  index: number;
  count: number;
  rowHeight: number;
  shift: number;
  onStart: () => void;
  onMove: (to: number) => void;
  onEnd: (to: number) => void;
  render: (handleProps: object) => React.ReactNode;
}

function ReorderRow({ index, count, rowHeight, shift, onStart, onMove, onEnd, render }: RowProps) {
  const dy = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(false);
  // The responder is created once; read the latest props through a ref.
  const latest = useRef({ index, count, rowHeight, onStart, onMove, onEnd });
  latest.current = { index, count, rowHeight, onStart, onMove, onEnd };

  const targetFor = (moved: number) => {
    const { index: i, count: n, rowHeight: h } = latest.current;
    return Math.min(Math.max(i + Math.round(moved / h), 0), n - 1);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dy.setValue(0);
        setActive(true);
        latest.current.onStart();
      },
      onPanResponderMove: (_e, g) => {
        dy.setValue(g.dy);
        latest.current.onMove(targetFor(g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        dy.setValue(0);
        setActive(false);
        latest.current.onEnd(targetFor(g.dy));
      },
      onPanResponderTerminate: () => {
        dy.setValue(0);
        setActive(false);
        latest.current.onEnd(latest.current.index);
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.row,
        { top: index * rowHeight, height: rowHeight },
        active
          ? { zIndex: 10, transform: [{ translateY: dy }] }
          : { transform: [{ translateY: shift }] },
      ]}
    >
      {render(responder.panHandlers)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0 },
});
