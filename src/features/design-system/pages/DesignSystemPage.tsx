import {
  Bell,
  CalendarClock,
  CircleCheck,
  Inbox,
  Info,
  MapPin,
  MoreHorizontal,
  PanelRightOpen,
  Settings,
  ShieldAlert,
  TriangleAlert,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { useState, type PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PublicLayout } from '../../../components/layout/PublicLayout'
import { ProfessionalCard } from '../../../components/marketplace/ProfessionalCard'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../../../components/ui/breadcrumb'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { Checkbox } from '../../../components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import { EmptyState } from '../../../components/ui/empty-state'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Pagination } from '../../../components/ui/pagination'
import { PrivacyNotice } from '../../../components/ui/privacy-notice'
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../../components/ui/sheet'
import { Skeleton } from '../../../components/ui/skeleton'
import { Switch } from '../../../components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs'
import { Textarea } from '../../../components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../../components/ui/tooltip'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

function Section({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  return (
    <section className="border-t pt-8">
      <div className="max-w-2xl">
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export function DesignSystemPage() {
  useDocumentTitle('Design System — ProFind')
  const [page, setPage] = useState(2)

  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Início</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Design system</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <header className="mt-8 max-w-3xl">
          <Badge variant="secondary">Fundação visual</Badge>
          <h1 className="mt-4 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
            Componentes ProFind
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Catálogo interno para validar consistência, acessibilidade, estados,
            temas e comportamento responsivo dos componentes base.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link to="/design-system/layouts/cliente">Layout Cliente</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/design-system/layouts/profissional">Layout Profissional</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/design-system/layouts/admin">Estrutura Admin</Link>
            </Button>
          </div>
        </header>

        <div className="mt-12 grid gap-10">
          <Section
            title="Ações e estados"
            description="Variantes previsíveis para hierarquia, carregamento, indisponibilidade e ações destrutivas."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primária</Button>
              <Button variant="secondary">Secundária</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="ghost">Discreta</Button>
              <Button variant="destructive">Excluir</Button>
              <Button loading loadingLabel="Salvando" />
              <Button disabled>Indisponível</Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge>Ativo</Badge>
              <Badge variant="secondary">Novo</Badge>
              <Badge variant="success">
                <CircleCheck aria-hidden="true" className="size-3" /> Aprovado
              </Badge>
              <Badge variant="warning">Pendente</Badge>
              <Badge variant="destructive">Cancelado</Badge>
              <Badge variant="outline">Rascunho</Badge>
            </div>
          </Section>

          <Section
            title="Formulários"
            description="Controles com labels, targets adequados ao toque, foco visível e estado de erro próximo ao campo."
          >
            <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ds-name">Nome completo</Label>
                <Input id="ds-name" placeholder="Como podemos chamar você?" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ds-email">E-mail</Label>
                <Input
                  id="ds-email"
                  type="email"
                  defaultValue="email-invalido"
                  aria-invalid="true"
                  aria-describedby="ds-email-error"
                />
                <p id="ds-email-error" className="text-sm font-medium text-destructive">
                  Informe um e-mail válido.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ds-category">Categoria</Label>
                <Select>
                  <SelectTrigger id="ds-category">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repairs">Reparos</SelectItem>
                    <SelectItem value="cleaning">Limpeza</SelectItem>
                    <SelectItem value="events">Eventos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:row-span-2">
                <Label htmlFor="ds-details">Detalhes</Label>
                <Textarea id="ds-details" placeholder="Descreva o que você precisa" />
              </div>
              <fieldset className="grid gap-3">
                <legend className="text-sm font-semibold">Prazo desejado</legend>
                <RadioGroup defaultValue="flexible">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="urgent" id="ds-urgent" />
                    <Label htmlFor="ds-urgent">Urgente</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="flexible" id="ds-flexible" />
                    <Label htmlFor="ds-flexible">Data flexível</Label>
                  </div>
                </RadioGroup>
              </fieldset>
              <div className="grid gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="ds-terms" />
                  <Label htmlFor="ds-terms">Aceito receber atualizações</Label>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="ds-notifications">Notificações</Label>
                  <Switch id="ds-notifications" aria-label="Ativar notificações" />
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Conteúdo e navegação"
            description="Agrupamentos usados apenas quando ajudam a comparar ou entender uma entidade."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-xs font-medium text-muted-foreground">Exemplo visual fictício · sem perfil publicado ou ações disponíveis</p>
                <ProfessionalCard name="Marina Souza" specialty="Manutenção residencial" area="Região central" rating={4.9} reviewCount={38} verified />
              </div>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Badge variant="secondary">Elétrica</Badge>
                    <span className="text-xs font-medium text-muted-foreground">
                      Publicado hoje
                    </span>
                  </div>
                  <CardTitle className="pt-2">Instalação de luminárias</CardTitle>
                  <CardDescription>
                    Serviço residencial com escopo e prazo apresentados antes da
                    proposta.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4" aria-hidden="true" />
                    Região central • localização aproximada
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4" aria-hidden="true" />
                    Prazo flexível nesta semana
                  </div>
                  <p>
                    <span className="font-semibold text-foreground">Orçamento:</span>{' '}
                    a combinar
                  </p>
                </CardContent>
                <CardFooter>
                  <Button>Ver serviço</Button>
                </CardFooter>
              </Card>
            </div>

            <div className="mt-6 border-t pt-6">
              <Tabs defaultValue="recentes">
                <TabsList aria-label="Filtrar atividades">
                  <TabsTrigger value="recentes">Recentes</TabsTrigger>
                  <TabsTrigger value="salvas">Salvas</TabsTrigger>
                </TabsList>
                <TabsContent value="recentes">
                  <p className="text-sm leading-6 text-muted-foreground">
                    Conteúdo recente priorizado para a tarefa atual.
                  </p>
                </TabsContent>
                <TabsContent value="salvas">
                  <p className="text-sm leading-6 text-muted-foreground">
                    Itens salvos ficam disponíveis nesta visualização.
                  </p>
                </TabsContent>
              </Tabs>
            </div>
            <div className="mt-6 max-w-xl">
              <Pagination
                page={page}
                totalPages={5}
                onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                onNext={() => setPage((current) => Math.min(5, current + 1))}
              />
            </div>
          </Section>

          <Section
            title="Feedback"
            description="Mensagens combinam ícone, título e texto para não depender somente de cor."
          >
            <PrivacyNotice className="mb-5 max-w-2xl">
              Endereço completo e contato só devem ser compartilhados quando o
              fluxo realmente precisar desses dados.
            </PrivacyNotice>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Alert variant="success">
                <CircleCheck aria-hidden="true" />
                <AlertTitle>Alterações salvas</AlertTitle>
                <AlertDescription>As informações já estão atualizadas.</AlertDescription>
              </Alert>
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Atenção necessária</AlertTitle>
                <AlertDescription>Revise os dados antes de continuar.</AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <ShieldAlert aria-hidden="true" />
                <AlertTitle>Não foi possível concluir</AlertTitle>
                <AlertDescription>Tente novamente em alguns instantes.</AlertDescription>
              </Alert>
              <Alert>
                <WifiOff aria-hidden="true" />
                <AlertTitle>Você está offline</AlertTitle>
                <AlertDescription>Alguns dados podem estar desatualizados.</AlertDescription>
              </Alert>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="outline"
                icon={<Bell />}
                onClick={() => toast.success('Preferência atualizada', { description: 'O feedback foi apresentado com sucesso.' })}
              >
                Mostrar toast
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Mais informações">
                    <Info aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Informação complementar curta.</TooltipContent>
              </Tooltip>
            </div>
          </Section>

          <Section
            title="Camadas e ações contextuais"
            description="Dialogs são reservados a decisões curtas; sheets acomodam tarefas secundárias em telas menores."
          >
            <div className="flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" icon={<ShieldAlert />}>Abrir diálogo</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirmar alteração</DialogTitle>
                    <DialogDescription>
                      Revise o contexto antes de confirmar esta ação.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                    <DialogClose asChild><Button>Confirmar</Button></DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" icon={<PanelRightOpen />}>Abrir painel</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Filtros</SheetTitle>
                    <SheetDescription>Ajuste opções sem perder o contexto atual.</SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 grid gap-2">
                    <Label htmlFor="ds-location">Localização aproximada</Label>
                    <Input id="ds-location" placeholder="Bairro ou cidade" />
                  </div>
                  <SheetFooter>
                    <Button>Aplicar filtros</Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" icon={<MoreHorizontal />}>Mais ações</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Opções</DropdownMenuLabel>
                  <DropdownMenuItem><UserRound /> Ver perfil</DropdownMenuItem>
                  <DropdownMenuItem><Settings /> Preferências</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled>Indisponível</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Section>

          <Section
            title="Carregamento e vazio"
            description="Skeletons representam a forma do conteúdo; estados vazios explicam o contexto e oferecem uma próxima ação útil."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div aria-busy="true" aria-label="Carregando profissional" className="rounded-lg border p-5">
                <span className="sr-only">Carregando profissional</span>
                <div className="flex gap-4">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
                <Skeleton className="mt-5 h-10 w-full" />
              </div>
              <div className="rounded-lg border">
                <EmptyState
                  icon={<Inbox />}
                  title="Nenhum item por aqui"
                  description="Quando houver conteúdo, ele aparecerá nesta área."
                  action={<Button variant="outline">Atualizar busca</Button>}
                />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </PublicLayout>
  )
}
