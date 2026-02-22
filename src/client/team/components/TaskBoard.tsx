import { useState, useCallback } from 'react';
import type { Task, CreateTaskInput, TaskStatus } from '../types';
import { TASK_COLUMNS } from '../constants';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';

interface TaskBoardProps {
  tasks: Task[];
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
  onUpdateTask: (taskId: string, changes: Partial<Task>) => Promise<void>;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export default function TaskBoard({ tasks, onCreateTask, onUpdateTask, onMoveTask, onDeleteTask }: TaskBoardProps) {
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>('backlog');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're actually leaving the column (not entering a child)
    const related = e.relatedTarget as Node | null;
    if (!related || !(e.currentTarget as Node).contains(related)) {
      setDragOverColumn(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, newStatus: TaskStatus) => {
      e.preventDefault();
      setDragOverColumn(null);
      const taskId = e.dataTransfer.getData('text/plain');
      if (taskId) {
        const task = tasks.find((t) => t.id === taskId);
        if (task && task.status !== newStatus) {
          onMoveTask(taskId, newStatus);
        }
      }
    },
    [tasks, onMoveTask],
  );

  const handleAddTask = (status: TaskStatus) => {
    setCreateStatus(status);
    setShowCreate(true);
  };

  return (
    <div className="task-board">
      {TASK_COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.status);
        return (
          <div
            key={col.status}
            className={`tb-column ${dragOverColumn === col.status ? 'tb-column-dragover' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            <div className="tb-column-header" style={{ borderBottomColor: col.color }}>
              <span className="tb-column-title">{col.label}</span>
              <span className="tb-column-count">{columnTasks.length}</span>
            </div>
            <div className="tb-column-body">
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={setEditingTask}
                  onDragStart={handleDragStart}
                />
              ))}
              <button className="tb-add-task" onClick={() => handleAddTask(col.status)}>
                + Add
              </button>
            </div>
          </div>
        );
      })}

      {editingTask && (
        <TaskModal
          task={editingTask}
          onSave={(changes) => onUpdateTask(editingTask.id, changes as Partial<Task>)}
          onDelete={onDeleteTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {showCreate && (
        <TaskModal
          task={null}
          defaultStatus={createStatus}
          onSave={(data) => onCreateTask(data as CreateTaskInput)}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
