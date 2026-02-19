import React, { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LibraryScreen from "../screens/LibraryScreen";
import ReaderScreen from "../screens/ReaderScreen";
import { initDB } from "../db";

export type RootStackParamList = {
  Library: undefined;
  Reader: { bookId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  useEffect(() => {
    initDB().catch((e) => console.log("DB init error:", e));
  }, []);

  return (
    <Stack.Navigator>
      <Stack.Screen name="Library" component={LibraryScreen} options={{ title: "Library" }} />
      <Stack.Screen name="Reader" component={ReaderScreen} options={{ title: "Reader" }} />
    </Stack.Navigator>
  );
}
