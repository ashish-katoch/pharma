import { Alert, Platform } from "react-native";

export function alertMsg(title: string, message?: string) {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n${message}` : title);
  } else {
    Alert.alert(title, message ?? "");
  }
}

export function alertNav(title: string, message: string, navigate: () => void) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n${message}`);
    navigate();
  } else {
    Alert.alert(title, message, [{ text: "OK", onPress: navigate }]);
  }
}
