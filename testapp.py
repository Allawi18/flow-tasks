import customtkinter as ctk
import tkinter as tk
import json
import os

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")


class TaskApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Tasks")
        self.root.geometry("420x760")

        self.data_file = "tasks.json"
        self.tasks = []
        self.selected_index = None

        self.filter_mode = "all"

        self.load_tasks()

        # ===== STATS =====
        self.stats_frame = ctk.CTkFrame(root)
        self.stats_frame.pack(fill="x", pady=10, padx=10)

        self.total_var = tk.StringVar()
        self.done_var = tk.StringVar()
        self.not_done_var = tk.StringVar()

        self.total_box = ctk.CTkFrame(self.stats_frame)
        self.total_box.pack(side="left", expand=True, fill="both", padx=5)

        self.done_box = ctk.CTkFrame(self.stats_frame)
        self.done_box.pack(side="left", expand=True, fill="both", padx=5)

        self.not_done_box = ctk.CTkFrame(self.stats_frame)
        self.not_done_box.pack(side="left", expand=True, fill="both", padx=5)

        ctk.CTkLabel(self.total_box, text="الإجمالي").pack(pady=(8, 2))
        ctk.CTkLabel(self.total_box, textvariable=self.total_var,
                     font=("Segoe UI", 20, "bold")).pack(pady=(0, 8))

        ctk.CTkLabel(self.done_box, text="المنجز").pack(pady=(8, 2))
        self.done_btn = ctk.CTkButton(
            self.done_box,
            textvariable=self.done_var,
            command=lambda: self.set_filter("done"),
            fg_color="transparent"
        )
        self.done_btn.pack(pady=(0, 8))

        ctk.CTkLabel(self.not_done_box, text="غير المنجز").pack(pady=(8, 2))
        self.not_done_btn = ctk.CTkButton(
            self.not_done_box,
            textvariable=self.not_done_var,
            command=lambda: self.set_filter("not_done"),
            fg_color="transparent"
        )
        self.not_done_btn.pack(pady=(0, 8))

        # ===== INPUT =====
        self.entry = ctk.CTkEntry(root, placeholder_text="اكتب مهمة...")
        self.entry.pack(fill="x", padx=10, pady=10)

        ctk.CTkButton(root, text="إضافة مهمة", command=self.add_task).pack(pady=5)

        # ===== TASK AREA =====
        self.scroll_frame = ctk.CTkScrollableFrame(root)
        self.scroll_frame.pack(fill="both", expand=True, padx=10, pady=10)

        # MENU
        self.menu = tk.Menu(root, tearoff=0)
        self.menu.add_command(label="حذف المهمة", command=self.delete_task)
        self.menu.add_command(label="تثبيت / إلغاء التثبيت", command=self.toggle_pin)

        self.refresh()

    # ===== STORAGE =====
    def save_tasks(self):
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump(self.tasks, f, ensure_ascii=False, indent=2)

    def load_tasks(self):
        if os.path.exists(self.data_file):
            with open(self.data_file, "r", encoding="utf-8") as f:
                self.tasks = json.load(f)

    # ===== CORE =====
    def add_task(self):
        text = self.entry.get().strip()
        if text:
            self.tasks.append({"text": text, "done": False, "pinned": False})
            self.entry.delete(0, "end")
            self.save_tasks()
            self.refresh()

    def toggle_task(self, index):
        self.tasks[index]["done"] = not self.tasks[index]["done"]
        self.save_tasks()
        self.refresh()

    def delete_task(self):
        if self.selected_index is not None:
            self.tasks.pop(self.selected_index)
            self.selected_index = None
            self.save_tasks()
            self.refresh()

    def toggle_pin(self):
        if self.selected_index is not None:
            self.tasks[self.selected_index]["pinned"] = not self.tasks[self.selected_index]["pinned"]
            self.save_tasks()
            self.refresh()

    # ===== FILTER =====
    def set_filter(self, mode):
        self.filter_mode = mode
        self.refresh()

    def get_tasks(self):
        if self.filter_mode == "done":
            return [t for t in self.tasks if t["done"]]
        if self.filter_mode == "not_done":
            return [t for t in self.tasks if not t["done"]]
        return self.tasks

    # ===== UI =====
    def refresh(self):
        for w in self.scroll_frame.winfo_children():
            w.destroy()

        total = len(self.tasks)
        done = len([t for t in self.tasks if t["done"]])
        not_done = total - done

        self.total_var.set(total)
        self.done_var.set(done)
        self.not_done_var.set(not_done)

        tasks = self.get_tasks()

        # IMPORTANT FIX:
        # keep pinned tasks from losing original index reference
        indexed_tasks = [(i, t) for i, t in enumerate(self.tasks)]
        pinned_first = sorted(indexed_tasks, key=lambda x: x[1].get("pinned", False), reverse=True)

        filtered_indices = set(id(t) for t in tasks)

        for i, task in pinned_first:
            if id(task) not in filtered_indices:
                continue
            self.create_card(i, task)

    # ===== CARD =====
    def create_card(self, index, task):
        is_done = task["done"]
        is_pinned = task.get("pinned", False)

        card = ctk.CTkFrame(self.scroll_frame, height=80)
        card.pack(fill="x", pady=8)
        card.pack_propagate(False)

        # FIXED COLOR LOGIC (was breaking after toggle)
        if is_pinned:
            color = "#fbbf24"
        elif is_done:
            color = "#22c55e"
        else:
            color = "#ef4444"

        text_color = "#9ca3af" if is_done else "white"

        dot = ctk.CTkLabel(card, text="●", text_color=color, font=("Segoe UI", 20, "bold"))
        dot.pack(side="left", padx=15)

        label = ctk.CTkLabel(
            card,
            text=task["text"],
            text_color=text_color,
            font=("Segoe UI", 13),
            anchor="e",
            justify="right"
        )
        label.pack(side="right", padx=15, fill="x", expand=True)

        card.bind("<Button-1>", lambda e, i=index: self.toggle_task(i))
        label.bind("<Button-1>", lambda e, i=index: self.toggle_task(i))
        dot.bind("<Button-1>", lambda e, i=index: self.toggle_task(i))

        card.bind("<Button-3>", lambda e, i=index: self.open_menu(e, i))
        label.bind("<Button-3>", lambda e, i=index: self.open_menu(e, i))
        dot.bind("<Button-3>", lambda e, i=index: self.open_menu(e, i))

    def open_menu(self, event, index):
        self.selected_index = index
        self.menu.post(event.x_root, event.y_root)


root = ctk.CTk()
app = TaskApp(root)
root.mainloop()