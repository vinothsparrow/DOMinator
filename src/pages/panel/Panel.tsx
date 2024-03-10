import React from 'react';
import { useTheme } from '@root/src/shared/hooks/useTheme';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import { Button } from '@src/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@src/components/ui/resizable';
import { Nav } from '@src/components/ui/nav';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@src/components/ui/tabs';
import { Inbox, Code } from 'lucide-react';

const Panel = () => {
  const { setTheme } = useTheme();
  return (
    <div className="bg-background w-full h-full">
      <ResizablePanelGroup direction="horizontal" className="rounded-lg border">
        <ResizablePanel minSize={10} maxSize={15} defaultSize={12}>
          <Nav
            isCollapsed={false}
            links={[
              {
                title: 'Messages',
                label: '1',
                icon: Inbox,
                variant: 'default',
              },
              {
                title: 'DOM Sink',
                label: '1',
                icon: Code,
                variant: 'ghost',
              },
            ]}></Nav>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={90}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel>
              <div className="flex h-full items-center justify-center p-6">
                <Button onClick={() => setTheme('light')}>Toggle theme</Button>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Panel, <div> Loading ... </div>), <div> Error Occur </div>);
